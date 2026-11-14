"use server";

import { normalizeIngestText } from "@/lib/ingest/normalize-text";
import { guardPlace, guardZone } from "@/lib/auth/mapper-place-guard";
import { getMapperSessionSecret } from "@/lib/auth/mapper-session";
import {
  processMapperPhotosCore,
  type ProcessPhotosResult,
} from "@/lib/vision/process-mapper-photos";
import {
  clearZoneItems,
  deleteZone,
  ensureActiveLayout,
  getPlace,
  listZoneItems,
  listZonesForPlace,
  publishZone,
  removeZoneItem,
  renameZone,
  setZoneItems,
  upsertZone,
  type ZoneItemInput,
  type ZoneItemRow,
  type ZoneListRow,
} from "@/lib/supabase/store";

export type { ProcessPhotosResult };

export type MapperPose = {
  heading_deg: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
};

export type ApplyTextResult =
  | {
      ok: true;
      zone: {
        id: string;
        zone_type: string;
        zone_label: string;
      };
      items_added: number;
      published: boolean;
      normalized: ReturnType<typeof normalizeIngestText>;
      zones: ZoneListRow[];
    }
  | { ok: false; error: string };

async function loadPlaceTeam(place_id: string) {
  const place = await getPlace(place_id);
  const layout = await ensureActiveLayout({
    team_id: place.team_id,
    place_id: place.id,
  });
  return { place, layout_version_id: layout.id };
}

export async function refreshMapperZones(place_id: string): Promise<{
  ok: true;
  zones: ZoneListRow[];
  layout_version_id: string | null;
} | { ok: false; error: string }> {
  try {
    const denied = await guardPlace(place_id);
    if (denied) return { ok: false, error: denied };
    const { layout_version_id, zones } = await listZonesForPlace(place_id);
    return { ok: true, zones, layout_version_id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to list zones",
    };
  }
}

export async function fetchZoneInventory(zone_id: string): Promise<{
  ok: true;
  items: ZoneItemRow[];
} | { ok: false; error: string }> {
  try {
    const denied = await guardZone(zone_id);
    if (denied) return { ok: false, error: denied };
    const items = await listZoneItems(zone_id);
    return { ok: true, items };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load items",
    };
  }
}

export async function applyMapperText(input: {
  place_id: string;
  text: string;
  sticky_zone_type?: string | null;
  sticky_zone_label?: string | null;
  /** append (default) or replace all items in the target zone */
  mode?: "append" | "replace";
  publish?: boolean;
  pose?: MapperPose | null;
}): Promise<ApplyTextResult> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const normalized = normalizeIngestText({
      text: input.text,
      sticky_zone_type: input.sticky_zone_type,
      sticky_zone_label: input.sticky_zone_label,
    });
    if ("error" in normalized) {
      return { ok: false, error: normalized.error };
    }

    const { place, layout_version_id } = await loadPlaceTeam(input.place_id);

    const poseNote = input.pose
      ? [
          input.pose.heading_deg != null
            ? `heading=${Math.round(input.pose.heading_deg)}°`
            : null,
          input.pose.latitude != null && input.pose.longitude != null
            ? `lat=${input.pose.latitude.toFixed(5)},lng=${input.pose.longitude.toFixed(5)}`
            : null,
          input.pose.accuracy_m != null
            ? `acc=${Math.round(input.pose.accuracy_m)}m`
            : null,
        ]
          .filter(Boolean)
          .join("; ")
      : "";

    const placement_note = [normalized.layout_note, poseNote || null]
      .filter(Boolean)
      .join(" | ");

    const zone = await upsertZone({
      team_id: place.team_id,
      layout_version_id,
      zone_type: normalized.zone_type,
      zone_label: normalized.zone_label,
      placement_note: placement_note || null,
    });

    const mode = input.mode === "replace" ? "replace" : "append";
    const items_added = normalized.items.length;
    if (mode === "replace" || items_added > 0) {
      const items: ZoneItemInput[] = normalized.items.map((name) => ({
        canonical_name: name,
        raw_label: name,
      }));
      await setZoneItems({
        team_id: place.team_id,
        zone_id: zone.id,
        items,
        mode,
      });
    }

    let published = false;
    if (
      input.publish !== false &&
      (mode === "replace" || normalized.items.length > 0 || placement_note)
    ) {
      await publishZone({ team_id: place.team_id, zone_id: zone.id });
      published = true;
    }

    const { zones } = await listZonesForPlace(input.place_id);
    return {
      ok: true,
      zone: {
        id: zone.id,
        zone_type: zone.zone_type,
        zone_label: zone.zone_label,
      },
      items_added,
      published,
      normalized,
      zones,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Ingest failed",
    };
  }
}

export async function addMapperItem(input: {
  place_id: string;
  zone_id: string;
  item_name: string;
  publish?: boolean;
}): Promise<
  | { ok: true; item_count: number; zones: ZoneListRow[] }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const name = input.item_name.trim();
    if (!name) return { ok: false, error: "Item name required" };
    const place = await getPlace(input.place_id);
    const result = await setZoneItems({
      team_id: place.team_id,
      zone_id: input.zone_id,
      items: [{ canonical_name: name, raw_label: name }],
      mode: "append",
    });
    if (input.publish !== false) {
      await publishZone({ team_id: place.team_id, zone_id: input.zone_id });
    }
    const { zones } = await listZonesForPlace(input.place_id);
    return { ok: true, item_count: result.item_count, zones };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Add item failed",
    };
  }
}

export async function removeMapperItem(input: {
  place_id: string;
  zone_id: string;
  item_id: string;
  publish?: boolean;
}): Promise<
  | { ok: true; item_count: number; zones: ZoneListRow[]; items: ZoneItemRow[] }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const place = await getPlace(input.place_id);
    const result = await removeZoneItem({
      team_id: place.team_id,
      zone_id: input.zone_id,
      item_id: input.item_id,
    });
    if (input.publish !== false) {
      await publishZone({ team_id: place.team_id, zone_id: input.zone_id });
    }
    const [{ zones }, items] = await Promise.all([
      listZonesForPlace(input.place_id),
      listZoneItems(input.zone_id),
    ]);
    return { ok: true, item_count: result.item_count, zones, items };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Remove item failed",
    };
  }
}

export async function clearMapperZoneItems(input: {
  place_id: string;
  zone_id: string;
  publish?: boolean;
}): Promise<
  | { ok: true; item_count: number; zones: ZoneListRow[] }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const place = await getPlace(input.place_id);
    const result = await clearZoneItems({
      team_id: place.team_id,
      zone_id: input.zone_id,
    });
    if (input.publish !== false) {
      await publishZone({ team_id: place.team_id, zone_id: input.zone_id });
    }
    const { zones } = await listZonesForPlace(input.place_id);
    return { ok: true, item_count: result.item_count, zones };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Clear zone failed",
    };
  }
}

/** Create or ensure a zone exists (empty OK) so it can be loaded as active. */
export async function saveMapperZone(input: {
  place_id: string;
  zone_type: string;
  zone_label: string;
  /** Directions for finding this area. Empty clears them. */
  near_landmark?: string | null;
}): Promise<
  | {
      ok: true;
      zone: { id: string; zone_type: string; zone_label: string };
      zones: ZoneListRow[];
    }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const { place, layout_version_id } = await loadPlaceTeam(input.place_id);
    const zone = await upsertZone({
      team_id: place.team_id,
      layout_version_id,
      zone_type: input.zone_type,
      zone_label: input.zone_label,
      near_landmark: input.near_landmark ?? "",
    });
    await publishZone({ team_id: place.team_id, zone_id: zone.id });
    const { zones } = await listZonesForPlace(input.place_id);
    return {
      ok: true,
      zone: {
        id: zone.id,
        zone_type: zone.zone_type,
        zone_label: zone.zone_label,
      },
      zones,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Save zone failed",
    };
  }
}

export async function renameMapperZone(input: {
  place_id: string;
  zone_id: string;
  zone_type: string;
  zone_label: string;
}): Promise<
  | {
      ok: true;
      zone: { id: string; zone_type: string; zone_label: string };
      zones: ZoneListRow[];
    }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const place = await getPlace(input.place_id);
    const zone = await renameZone({
      team_id: place.team_id,
      zone_id: input.zone_id,
      zone_type: input.zone_type,
      zone_label: input.zone_label,
    });
    // Keep published title in sync when possible
    try {
      await publishZone({ team_id: place.team_id, zone_id: zone.id });
    } catch {
      // empty zones may not publish — rename still succeeded
    }
    const { zones } = await listZonesForPlace(input.place_id);
    return {
      ok: true,
      zone: {
        id: zone.id,
        zone_type: zone.zone_type,
        zone_label: zone.zone_label,
      },
      zones,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Rename zone failed",
    };
  }
}

export async function deleteMapperZone(input: {
  place_id: string;
  zone_id: string;
}): Promise<{ ok: true; zones: ZoneListRow[] } | { ok: false; error: string }> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const place = await getPlace(input.place_id);
    await deleteZone({ team_id: place.team_id, zone_id: input.zone_id });
    const { zones } = await listZonesForPlace(input.place_id);
    return { ok: true, zones };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Delete zone failed",
    };
  }
}

/** @deprecated Prefer POST /api/map/process-photos (longer timeout + smaller payloads). */
export async function processMapperPhotos(
  formData: FormData
): Promise<ProcessPhotosResult> {
  const placeId = String(formData.get("place_id") || "").trim();
  if (getMapperSessionSecret()) {
    if (!placeId) return { ok: false, error: "Sign in required" };
    const denied = await guardPlace(placeId);
    if (denied) return { ok: false, error: denied };
  }
  return processMapperPhotosCore(formData);
}
