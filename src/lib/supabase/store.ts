import { createLocationsAdminClient } from "./admin";
import { LOCATIONS_TABLES } from "./tables";

export class LocationsStoreError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "LocationsStoreError";
  }
}

function client() {
  const supabase = createLocationsAdminClient();
  if (!supabase) {
    throw new LocationsStoreError(
      "Supabase not configured",
      "SUPABASE_NOT_CONFIGURED"
    );
  }
  return supabase;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export type PlaceRow = {
  id: string;
  team_id: string;
  primary_bot_id: string | null;
  name: string;
  address: string | null;
  is_active: boolean;
};

export type ZoneRow = {
  id: string;
  team_id: string;
  place_id: string;
  layout_version_id: string;
  zone_type: string;
  zone_label: string;
  zone_description: string | null;
  near_landmark: string | null;
  placement_note: string | null;
  is_active: boolean;
};

export type ZoneItemInput = {
  canonical_name: string;
  raw_label?: string | null;
  brand?: string | null;
  variant?: string | null;
  size_text?: string | null;
  category_labels?: string[] | null;
  shelf_hint?: string | null;
};

export async function createPlace(input: {
  team_id: string;
  name: string;
  address?: string | null;
  primary_bot_id?: string | null;
  bot_ids?: string[];
}): Promise<PlaceRow> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.places)
    .insert({
      team_id: input.team_id,
      name: input.name.trim(),
      address: input.address?.trim() || null,
      primary_bot_id: input.primary_bot_id || null,
    })
    .select(
      "id, team_id, primary_bot_id, name, address, is_active"
    )
    .single();

  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to create place",
      "PLACE_CREATE_FAILED"
    );
  }

  const botIds = new Set<string>();
  if (input.primary_bot_id) botIds.add(input.primary_bot_id);
  for (const id of input.bot_ids || []) {
    const s = asString(id);
    if (s) botIds.add(s);
  }

  if (botIds.size > 0) {
    const rows = [...botIds].map((bot_id) => ({
      place_id: data.id as string,
      bot_id,
    }));
    const { error: linkError } = await supabase
      .from(LOCATIONS_TABLES.placeBots)
      .upsert(rows);
    if (linkError) {
      throw new LocationsStoreError(
        linkError.message,
        "PLACE_BOT_LINK_FAILED"
      );
    }
  }

  // Ensure an active layout so zones can be added immediately.
  await ensureActiveLayout({
    team_id: input.team_id,
    place_id: data.id as string,
  });

  return data as PlaceRow;
}

export async function updatePlace(input: {
  place_id: string;
  name?: string;
  address?: string | null;
  is_active?: boolean;
  bot_ids?: string[];
}): Promise<PlaceRow> {
  const supabase = client();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.address !== undefined) patch.address = input.address?.trim() || null;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.places)
    .update(patch)
    .eq("id", input.place_id)
    .select(
      "id, team_id, primary_bot_id, name, address, is_active"
    )
    .maybeSingle();

  if (error) {
    throw new LocationsStoreError(error.message, "PLACE_UPDATE_FAILED");
  }
  if (!data) {
    throw new LocationsStoreError("Place not found", "PLACE_NOT_FOUND");
  }

  if (input.bot_ids) {
    await supabase
      .from(LOCATIONS_TABLES.placeBots)
      .delete()
      .eq("place_id", input.place_id);
    const rows = input.bot_ids
      .map((id) => asString(id))
      .filter((id): id is string => Boolean(id))
      .map((bot_id) => ({ place_id: input.place_id, bot_id }));
    if (rows.length > 0) {
      const { error: linkError } = await supabase
        .from(LOCATIONS_TABLES.placeBots)
        .insert(rows);
      if (linkError) {
        throw new LocationsStoreError(
          linkError.message,
          "PLACE_BOT_LINK_FAILED"
        );
      }
    }
  }

  return data as PlaceRow;
}

export async function listPlacesForBot(input: {
  bot_id: string;
  team_id?: string;
}): Promise<PlaceRow[]> {
  const supabase = client();
  const { data: links, error: linkError } = await supabase
    .from(LOCATIONS_TABLES.placeBots)
    .select("place_id")
    .eq("bot_id", input.bot_id);

  if (linkError) {
    throw new LocationsStoreError(linkError.message, "PLACES_LIST_FAILED");
  }

  const idSet = new Set<string>(
    (links || []).map((r) => r.place_id as string)
  );

  let primaryQuery = supabase
    .from(LOCATIONS_TABLES.places)
    .select("id, team_id, primary_bot_id, name, address, is_active")
    .eq("is_active", true)
    .eq("primary_bot_id", input.bot_id);
  if (input.team_id) primaryQuery = primaryQuery.eq("team_id", input.team_id);

  const { data: primary, error: primaryError } = await primaryQuery;
  if (primaryError) {
    throw new LocationsStoreError(primaryError.message, "PLACES_LIST_FAILED");
  }
  for (const row of primary || []) idSet.add(row.id as string);

  if (idSet.size === 0) return [];

  let byId = supabase
    .from(LOCATIONS_TABLES.places)
    .select("id, team_id, primary_bot_id, name, address, is_active")
    .eq("is_active", true)
    .in("id", [...idSet])
    .order("name");
  if (input.team_id) byId = byId.eq("team_id", input.team_id);

  const { data, error } = await byId;
  if (error) {
    throw new LocationsStoreError(error.message, "PLACES_LIST_FAILED");
  }
  const deduped: PlaceRow[] = [];
  const seen = new Set<string>();
  for (const row of (data || []) as PlaceRow[]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }
  return deduped;
}

export async function getPlace(place_id: string): Promise<PlaceRow> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.places)
    .select("id, team_id, primary_bot_id, name, address, is_active")
    .eq("id", place_id)
    .maybeSingle();
  if (error) {
    throw new LocationsStoreError(error.message, "PLACE_GET_FAILED");
  }
  if (!data) {
    throw new LocationsStoreError("Place not found", "PLACE_NOT_FOUND");
  }
  return data as PlaceRow;
}

export async function ensureActiveLayout(input: {
  team_id: string;
  place_id: string;
  name?: string;
  notes?: string | null;
}): Promise<{ id: string; place_id: string; status: string; name: string }> {
  const supabase = client();
  const { data: existing, error: findError } = await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .select("id, place_id, status, name")
    .eq("place_id", input.place_id)
    .eq("status", "active")
    .maybeSingle();

  if (findError) {
    throw new LocationsStoreError(findError.message, "LAYOUT_GET_FAILED");
  }
  if (existing) return existing as { id: string; place_id: string; status: string; name: string };

  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .insert({
      team_id: input.team_id,
      place_id: input.place_id,
      name: input.name?.trim() || "Current layout",
      status: "active",
      notes: input.notes?.trim() || null,
    })
    .select("id, place_id, status, name")
    .single();

  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to create layout",
      "LAYOUT_CREATE_FAILED"
    );
  }
  return data as { id: string; place_id: string; status: string; name: string };
}

export async function createLayout(input: {
  team_id: string;
  place_id: string;
  name?: string;
  notes?: string | null;
  activate?: boolean;
}): Promise<{ id: string; place_id: string; status: string; name: string }> {
  const supabase = client();
  const place = await getPlace(input.place_id);
  if (place.team_id !== input.team_id) {
    throw new LocationsStoreError("Place team mismatch", "FORBIDDEN");
  }

  if (input.activate !== false) {
    await supabase
      .from(LOCATIONS_TABLES.placeLayoutVersions)
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("place_id", input.place_id)
      .eq("status", "active");
  }

  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .insert({
      team_id: input.team_id,
      place_id: input.place_id,
      name: input.name?.trim() || "Current layout",
      status: input.activate === false ? "draft" : "active",
      notes: input.notes?.trim() || null,
    })
    .select("id, place_id, status, name")
    .single();

  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to create layout",
      "LAYOUT_CREATE_FAILED"
    );
  }
  return data as { id: string; place_id: string; status: string; name: string };
}

export async function activateLayout(input: {
  layout_version_id: string;
}): Promise<{ id: string; place_id: string; status: string; name: string }> {
  const supabase = client();
  const { data: layout, error } = await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .select("id, place_id, status, name")
    .eq("id", input.layout_version_id)
    .maybeSingle();
  if (error) {
    throw new LocationsStoreError(error.message, "LAYOUT_GET_FAILED");
  }
  if (!layout) {
    throw new LocationsStoreError("Layout not found", "LAYOUT_NOT_FOUND");
  }

  await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("place_id", layout.place_id)
    .eq("status", "active")
    .neq("id", layout.id);

  const { data, error: updError } = await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .update({
      status: "active",
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", layout.id)
    .select("id, place_id, status, name")
    .single();

  if (updError || !data) {
    throw new LocationsStoreError(
      updError?.message || "Failed to activate layout",
      "LAYOUT_ACTIVATE_FAILED"
    );
  }
  return data as { id: string; place_id: string; status: string; name: string };
}

export async function upsertZone(input: {
  team_id: string;
  layout_version_id: string;
  zone_type: string;
  zone_label: string;
  zone_description?: string | null;
  near_landmark?: string | null;
  placement_note?: string | null;
}): Promise<ZoneRow> {
  const supabase = client();
  const { data: layout, error: layoutError } = await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .select("id, place_id, team_id")
    .eq("id", input.layout_version_id)
    .maybeSingle();
  if (layoutError) {
    throw new LocationsStoreError(layoutError.message, "LAYOUT_GET_FAILED");
  }
  if (!layout) {
    throw new LocationsStoreError("Layout not found", "LAYOUT_NOT_FOUND");
  }
  if (layout.team_id !== input.team_id) {
    throw new LocationsStoreError("Layout team mismatch", "FORBIDDEN");
  }

  const zoneType = input.zone_type.trim();
  const zoneLabel = input.zone_label.trim();

  const { data: existing } = await supabase
    .from(LOCATIONS_TABLES.zones)
    .select(
      "id, team_id, place_id, layout_version_id, zone_type, zone_label, zone_description, near_landmark, placement_note, is_active"
    )
    .eq("layout_version_id", input.layout_version_id)
    .eq("zone_type", zoneType)
    .eq("zone_label", zoneLabel)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from(LOCATIONS_TABLES.zones)
      .update({
        zone_description: input.zone_description?.trim() || null,
        near_landmark: input.near_landmark?.trim() || null,
        placement_note: input.placement_note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(
        "id, team_id, place_id, layout_version_id, zone_type, zone_label, zone_description, near_landmark, placement_note, is_active"
      )
      .single();
    if (error || !data) {
      throw new LocationsStoreError(
        error?.message || "Failed to update zone",
        "ZONE_UPDATE_FAILED"
      );
    }
    return data as ZoneRow;
  }

  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.zones)
    .insert({
      team_id: input.team_id,
      place_id: layout.place_id,
      layout_version_id: input.layout_version_id,
      zone_type: zoneType,
      zone_label: zoneLabel,
      zone_description: input.zone_description?.trim() || null,
      near_landmark: input.near_landmark?.trim() || null,
      placement_note: input.placement_note?.trim() || null,
    })
    .select(
      "id, team_id, place_id, layout_version_id, zone_type, zone_label, zone_description, near_landmark, placement_note, is_active"
    )
    .single();

  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to create zone",
      "ZONE_CREATE_FAILED"
    );
  }
  return data as ZoneRow;
}

export async function setZoneItems(input: {
  team_id: string;
  zone_id: string;
  items: ZoneItemInput[];
  mode?: "append" | "replace";
}): Promise<{ zone_id: string; item_count: number }> {
  const supabase = client();
  const { data: zone, error: zoneError } = await supabase
    .from(LOCATIONS_TABLES.zones)
    .select("id, team_id")
    .eq("id", input.zone_id)
    .maybeSingle();
  if (zoneError) {
    throw new LocationsStoreError(zoneError.message, "ZONE_GET_FAILED");
  }
  if (!zone) {
    throw new LocationsStoreError("Zone not found", "ZONE_NOT_FOUND");
  }
  if (zone.team_id !== input.team_id) {
    throw new LocationsStoreError("Zone team mismatch", "FORBIDDEN");
  }

  const mode = input.mode === "replace" ? "replace" : "append";
  if (mode === "replace") {
    const { error: delError } = await supabase
      .from(LOCATIONS_TABLES.zoneItems)
      .delete()
      .eq("zone_id", input.zone_id);
    if (delError) {
      throw new LocationsStoreError(delError.message, "ZONE_ITEMS_CLEAR_FAILED");
    }
  }

  const rows = input.items
    .map((item) => {
      const name = asString(item.canonical_name);
      if (!name) return null;
      return {
        team_id: input.team_id,
        zone_id: input.zone_id,
        canonical_name: name,
        raw_label: item.raw_label?.trim() || null,
        brand: item.brand?.trim() || null,
        variant: item.variant?.trim() || null,
        size_text: item.size_text?.trim() || null,
        category_labels: item.category_labels || null,
        shelf_hint: item.shelf_hint?.trim() || null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (rows.length > 0) {
    const { error } = await supabase.from(LOCATIONS_TABLES.zoneItems).insert(rows);
    if (error) {
      throw new LocationsStoreError(error.message, "ZONE_ITEMS_SET_FAILED");
    }
  }

  const { count, error: countError } = await supabase
    .from(LOCATIONS_TABLES.zoneItems)
    .select("id", { count: "exact", head: true })
    .eq("zone_id", input.zone_id);
  if (countError) {
    throw new LocationsStoreError(countError.message, "ZONE_ITEMS_COUNT_FAILED");
  }

  return { zone_id: input.zone_id, item_count: count || 0 };
}

export async function publishZone(input: {
  team_id: string;
  zone_id: string;
}): Promise<{
  publication_id: string;
  zone_id: string;
  title: string;
  item_count: number;
}> {
  const supabase = client();
  const { data: zone, error: zoneError } = await supabase
    .from(LOCATIONS_TABLES.zones)
    .select(
      "id, team_id, place_id, layout_version_id, zone_type, zone_label, zone_description, near_landmark, placement_note"
    )
    .eq("id", input.zone_id)
    .maybeSingle();
  if (zoneError) {
    throw new LocationsStoreError(zoneError.message, "ZONE_GET_FAILED");
  }
  if (!zone) {
    throw new LocationsStoreError("Zone not found", "ZONE_NOT_FOUND");
  }
  if (zone.team_id !== input.team_id) {
    throw new LocationsStoreError("Zone team mismatch", "FORBIDDEN");
  }

  const { data: items, error: itemsError } = await supabase
    .from(LOCATIONS_TABLES.zoneItems)
    .select(
      "canonical_name, raw_label, brand, variant, size_text, category_labels, shelf_hint"
    )
    .eq("zone_id", input.zone_id)
    .order("canonical_name");
  if (itemsError) {
    throw new LocationsStoreError(itemsError.message, "ZONE_ITEMS_GET_FAILED");
  }

  const title = `${zone.zone_type} ${zone.zone_label}`.trim();
  const itemLines = (items || [])
    .map((i) => `- ${i.canonical_name}`)
    .join("\n");
  const content = [
    title,
    zone.zone_description ? `Description: ${zone.zone_description}` : null,
    zone.near_landmark ? `Near: ${zone.near_landmark}` : null,
    zone.placement_note ? `Note: ${zone.placement_note}` : null,
    items && items.length > 0 ? `Items:\n${itemLines}` : "Items: (none)",
  ]
    .filter(Boolean)
    .join("\n");

  await supabase
    .from(LOCATIONS_TABLES.zonePublications)
    .update({
      is_current: false,
      publication_status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .eq("zone_id", input.zone_id)
    .eq("is_current", true);

  const { data: pub, error: pubError } = await supabase
    .from(LOCATIONS_TABLES.zonePublications)
    .insert({
      team_id: input.team_id,
      place_id: zone.place_id,
      layout_version_id: zone.layout_version_id,
      zone_id: zone.id,
      title,
      content,
      summary: `${(items || []).length} item(s)`,
      items_snapshot: items || [],
      publication_status: "published",
      is_current: true,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (pubError || !pub) {
    throw new LocationsStoreError(
      pubError?.message || "Failed to publish zone",
      "ZONE_PUBLISH_FAILED"
    );
  }

  return {
    publication_id: pub.id as string,
    zone_id: zone.id as string,
    title,
    item_count: (items || []).length,
  };
}

export async function getPlaceContext(place_id: string): Promise<{
  place: PlaceRow;
  layout_version_id: string | null;
  zone_count: number;
  published_zone_count: number;
}> {
  const place = await getPlace(place_id);
  const supabase = client();
  const { data: layout } = await supabase
    .from(LOCATIONS_TABLES.placeLayoutVersions)
    .select("id")
    .eq("place_id", place_id)
    .eq("status", "active")
    .maybeSingle();

  let zone_count = 0;
  if (layout?.id) {
    const { count } = await supabase
      .from(LOCATIONS_TABLES.zones)
      .select("id", { count: "exact", head: true })
      .eq("layout_version_id", layout.id)
      .eq("is_active", true);
    zone_count = count || 0;
  }

  const { count: published_zone_count } = await supabase
    .from(LOCATIONS_TABLES.zonePublications)
    .select("id", { count: "exact", head: true })
    .eq("place_id", place_id)
    .eq("is_current", true)
    .eq("publication_status", "published");

  return {
    place,
    layout_version_id: (layout?.id as string) || null,
    zone_count,
    published_zone_count: published_zone_count || 0,
  };
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(" ")
    .filter((t) => t.length >= 3);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function textMatchesQuery(haystack: string, query: string): boolean {
  const hay = normalizeSearchText(haystack);
  const q = normalizeSearchText(query);
  if (!hay || !q) return false;
  if (hay.includes(q) || q.includes(hay)) return true;
  const tokens = queryTokens(q);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return hay.includes(tokens[0]);
  // All tokens, or last token as primary noun when distinctive (≥6): "breakfast cereal"
  if (tokens.every((t) => hay.includes(t))) return true;
  const primary = tokens[tokens.length - 1];
  return primary.length >= 6 && hay.includes(primary);
}

/** Softer match for zone labels (e.g. "deli meat" → Delicatessen, "friut" → Fruit). */
function zoneLabelMatchesQuery(zoneHay: string, query: string): boolean {
  if (textMatchesQuery(zoneHay, query)) return true;
  const hay = normalizeSearchText(zoneHay);
  const tokens = queryTokens(query);
  // "deli" in Delicatessen; require token ≥4
  if (tokens.some((t) => t.length >= 4 && hay.includes(t))) return true;

  // Typo tolerance vs zone label tokens only (friut → fruit).
  // Equal-length + dist≤2 catches transpositions; avoid cereal≈cream (diff len).
  const labelTokens = hay.split(" ").filter((t) => t.length >= 4);
  const fuzzySources =
    tokens.length <= 1 ? tokens : [tokens[tokens.length - 1]];
  for (const part of fuzzySources) {
    if (part.length < 4) continue;
    for (const label of labelTokens) {
      if (part[0] !== label[0]) continue;
      const dist = editDistance(part, label);
      if (part.length === label.length && dist <= 2) return true;
      if (Math.abs(part.length - label.length) === 1 && dist <= 1) return true;
    }
  }
  return false;
}

export async function resolveItem(input: {
  place_id: string;
  item_query: string;
}): Promise<{
  matches: Array<{
    zone_id: string;
    zone_type: string;
    zone_label: string;
    publication_id: string;
    matched_name: string;
    near_landmark: string | null;
  }>;
}> {
  const query = input.item_query.trim();
  if (!query) {
    return { matches: [] };
  }

  const supabase = client();
  const { data: pubs, error } = await supabase
    .from(LOCATIONS_TABLES.zonePublications)
    .select("id, zone_id, items_snapshot, title")
    .eq("place_id", input.place_id)
    .eq("is_current", true)
    .eq("publication_status", "published");

  if (error) {
    throw new LocationsStoreError(error.message, "RESOLVE_FAILED");
  }

  const zoneIds = [...new Set((pubs || []).map((p) => p.zone_id as string))];
  const zoneById = new Map<
    string,
    { zone_type: string; zone_label: string; near_landmark: string | null }
  >();
  if (zoneIds.length > 0) {
    const { data: zones } = await supabase
      .from(LOCATIONS_TABLES.zones)
      .select("id, zone_type, zone_label, near_landmark")
      .in("id", zoneIds);
    for (const z of zones || []) {
      zoneById.set(z.id as string, {
        zone_type: (z.zone_type as string) || "zone",
        zone_label: (z.zone_label as string) || "",
        near_landmark: (z.near_landmark as string) || null,
      });
    }
  }

  type Match = {
    zone_id: string;
    zone_type: string;
    zone_label: string;
    /** Shopper-facing location, e.g. "Aisle 6" or "Household section". */
    where: string;
    publication_id: string;
    matched_name: string;
    near_landmark: string | null;
  };

  function formatWhere(zoneType: string, zoneLabel: string): string {
    const label = zoneLabel.trim();
    const type = zoneType.trim().toLowerCase();
    if (!label) return type || "unknown area";
    if (/^aisle\b/i.test(label)) return label;
    if (type === "aisle") return `Aisle ${label}`;
    if (type === "section") return `${label} section`;
    return `${type} ${label}`.trim();
  }
  const zoneMatches: Match[] = [];
  const itemMatches: Match[] = [];
  const matchedZones = new Set<string>();

  // Pass 1: zone labels (prefer "Fruit" section over items named "fruit pastilles")
  for (const pub of pubs || []) {
    const zoneId = pub.zone_id as string;
    const zone = zoneById.get(zoneId);
    const zoneType = zone?.zone_type || "zone";
    const zoneLabel = zone?.zone_label || "";
    const near = zone?.near_landmark || null;
    const zoneHay = `${zoneType} ${zoneLabel}`;
    if (zoneLabelMatchesQuery(zoneHay, query)) {
      zoneMatches.push({
        zone_id: zoneId,
        zone_type: zoneType,
        zone_label: zoneLabel,
        where: formatWhere(zoneType, zoneLabel),
        publication_id: pub.id as string,
        matched_name: zoneLabel || (pub.title as string) || "this section",
        near_landmark: near,
      });
      matchedZones.add(zoneId);
    }
  }

  // Pass 2: item names for zones not already claimed by label
  for (const pub of pubs || []) {
    const zoneId = pub.zone_id as string;
    if (matchedZones.has(zoneId)) continue;
    const zone = zoneById.get(zoneId);
    const zoneType = zone?.zone_type || "zone";
    const zoneLabel = zone?.zone_label || "";
    const near = zone?.near_landmark || null;
    const snapshot = Array.isArray(pub.items_snapshot)
      ? pub.items_snapshot
      : [];
    for (const item of snapshot) {
      const name =
        typeof item?.canonical_name === "string"
          ? item.canonical_name
          : typeof item?.raw_label === "string"
            ? item.raw_label
            : "";
      if (!name) continue;
      const brand = typeof item?.brand === "string" ? item.brand : "";
      if (textMatchesQuery(`${name} ${brand}`, query)) {
        itemMatches.push({
          zone_id: zoneId,
          zone_type: zoneType,
          zone_label: zoneLabel,
          where: formatWhere(zoneType, zoneLabel),
          publication_id: pub.id as string,
          matched_name: name,
          near_landmark: near,
        });
        matchedZones.add(zoneId);
        break;
      }
    }
  }

  return { matches: [...zoneMatches, ...itemMatches] };
}

export async function getPlaceMap(place_id: string): Promise<{
  place_id: string;
  publications: Array<{
    id: string;
    zone_id: string;
    title: string;
    content: string;
    summary: string | null;
    items_snapshot: unknown;
  }>;
}> {
  await getPlace(place_id);
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.zonePublications)
    .select("id, zone_id, title, content, summary, items_snapshot")
    .eq("place_id", place_id)
    .eq("is_current", true)
    .eq("publication_status", "published")
    .order("title");
  if (error) {
    throw new LocationsStoreError(error.message, "PLACE_MAP_FAILED");
  }
  return {
    place_id,
    publications: (data || []) as Array<{
      id: string;
      zone_id: string;
      title: string;
      content: string;
      summary: string | null;
      items_snapshot: unknown;
    }>,
  };
}

export async function getCoverage(place_id: string): Promise<{
  place_id: string;
  published_zones: number;
  draft_or_unpublished_zones: number;
}> {
  const ctx = await getPlaceContext(place_id);
  return {
    place_id,
    published_zones: ctx.published_zone_count,
    draft_or_unpublished_zones: Math.max(
      0,
      ctx.zone_count - ctx.published_zone_count
    ),
  };
}
