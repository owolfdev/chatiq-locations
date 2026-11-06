"use server";

import { normalizeIngestText } from "@/lib/ingest/normalize-text";
import {
  ensureActiveLayout,
  getPlace,
  listZoneItems,
  listZonesForPlace,
  publishZone,
  setZoneItems,
  upsertZone,
  type ZoneItemInput,
  type ZoneListRow,
} from "@/lib/supabase/store";

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
  items: ZoneItemInput[];
} | { ok: false; error: string }> {
  try {
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
  publish?: boolean;
  pose?: MapperPose | null;
}): Promise<ApplyTextResult> {
  try {
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

    const items_added = normalized.items.length;
    if (items_added > 0) {
      const items: ZoneItemInput[] = normalized.items.map((name) => ({
        canonical_name: name,
        raw_label: name,
      }));
      await setZoneItems({
        team_id: place.team_id,
        zone_id: zone.id,
        items,
        mode: "append",
      });
    }

    let published = false;
    if (input.publish !== false && (normalized.items.length > 0 || placement_note)) {
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
