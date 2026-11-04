import { LOCATIONS_API_CONTRACT_VERSION } from "@/lib/contract";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  activateLayout,
  createLayout,
  createPlace,
  getCoverage,
  getPlaceContext,
  getPlaceMap,
  listPlacesForBot,
  LocationsStoreError,
  publishZone,
  resolveItem,
  setZoneItems,
  updatePlace,
  upsertZone,
  type ZoneItemInput,
} from "@/lib/supabase/store";

export type LocationsCommandExecuteRequest = {
  contract_version?: string;
  command: string;
  slots?: Record<string, unknown>;
  actor?: {
    kind?: string;
    bot_id?: string;
    team_id?: string;
    user_id?: string;
  };
};

export type LocationsCommandExecuteResponse =
  | {
      ok: true;
      contract_version: string;
      command: string;
      data: Record<string, unknown>;
    }
  | {
      ok: false;
      contract_version: string;
      error: string;
      code: string;
      command?: string;
    };

function slotString(
  slots: Record<string, unknown> | undefined,
  key: string
): string | null {
  const v = slots?.[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function requireTeamId(
  req: LocationsCommandExecuteRequest
): string {
  const fromActor = slotString(
    req.actor as Record<string, unknown> | undefined,
    "team_id"
  );
  const fromSlots = slotString(req.slots, "team_id");
  const teamId = fromSlots || fromActor || req.actor?.team_id?.trim() || null;
  if (!teamId) {
    throw new LocationsStoreError("team_id required", "INVALID_REQUEST");
  }
  return teamId;
}

function parseItems(raw: unknown): ZoneItemInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ZoneItemInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name =
      typeof row.canonical_name === "string"
        ? row.canonical_name
        : typeof row.name === "string"
          ? row.name
          : null;
    if (!name?.trim()) continue;
    out.push({
      canonical_name: name.trim(),
      raw_label: typeof row.raw_label === "string" ? row.raw_label : null,
      brand: typeof row.brand === "string" ? row.brand : null,
      variant: typeof row.variant === "string" ? row.variant : null,
      size_text: typeof row.size_text === "string" ? row.size_text : null,
      category_labels: Array.isArray(row.category_labels)
        ? row.category_labels.filter(
            (x): x is string => typeof x === "string"
          )
        : null,
      shelf_hint: typeof row.shelf_hint === "string" ? row.shelf_hint : null,
    });
  }
  return out;
}

export async function executeLocationsCommand(
  req: LocationsCommandExecuteRequest
): Promise<LocationsCommandExecuteResponse> {
  const command = req.command?.trim();
  if (!command) {
    return {
      ok: false,
      contract_version: LOCATIONS_API_CONTRACT_VERSION,
      error: "command required",
      code: "INVALID_COMMAND",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      contract_version: LOCATIONS_API_CONTRACT_VERSION,
      error: "Supabase not configured",
      code: "SUPABASE_NOT_CONFIGURED",
      command,
    };
  }

  try {
    const slots = req.slots || {};
    let data: Record<string, unknown>;

    switch (command) {
      case "place.create": {
        const team_id = requireTeamId(req);
        const name = slotString(slots, "name");
        if (!name) {
          throw new LocationsStoreError("name required", "INVALID_REQUEST");
        }
        const bot_ids = Array.isArray(slots.bot_ids)
          ? slots.bot_ids.filter((x): x is string => typeof x === "string")
          : undefined;
        const place = await createPlace({
          team_id,
          name,
          address: slotString(slots, "address"),
          primary_bot_id:
            slotString(slots, "primary_bot_id") ||
            slotString(slots, "bot_id") ||
            req.actor?.bot_id ||
            null,
          bot_ids,
        });
        const ctx = await getPlaceContext(place.id);
        data = { place, layout_version_id: ctx.layout_version_id };
        break;
      }
      case "place.update": {
        const place_id = slotString(slots, "place_id");
        if (!place_id) {
          throw new LocationsStoreError("place_id required", "INVALID_REQUEST");
        }
        const bot_ids = Array.isArray(slots.bot_ids)
          ? slots.bot_ids.filter((x): x is string => typeof x === "string")
          : undefined;
        const place = await updatePlace({
          place_id,
          name: slotString(slots, "name") || undefined,
          address:
            slots.address === null
              ? null
              : slotString(slots, "address") || undefined,
          is_active:
            typeof slots.is_active === "boolean" ? slots.is_active : undefined,
          bot_ids,
        });
        data = { place };
        break;
      }
      case "places.list": {
        const bot_id =
          slotString(slots, "bot_id") || req.actor?.bot_id || null;
        if (!bot_id) {
          throw new LocationsStoreError("bot_id required", "INVALID_REQUEST");
        }
        const places = await listPlacesForBot({
          bot_id,
          team_id: slotString(slots, "team_id") || req.actor?.team_id || undefined,
        });
        data = { places };
        break;
      }
      case "place.get_context": {
        const place_id = slotString(slots, "place_id");
        if (!place_id) {
          throw new LocationsStoreError("place_id required", "INVALID_REQUEST");
        }
        data = await getPlaceContext(place_id);
        break;
      }
      case "layout.create": {
        const team_id = requireTeamId(req);
        const place_id = slotString(slots, "place_id");
        if (!place_id) {
          throw new LocationsStoreError("place_id required", "INVALID_REQUEST");
        }
        const layout = await createLayout({
          team_id,
          place_id,
          name: slotString(slots, "name") || undefined,
          notes: slotString(slots, "notes"),
          activate: slots.activate !== false,
        });
        data = { layout };
        break;
      }
      case "layout.activate": {
        const layout_version_id = slotString(slots, "layout_version_id");
        if (!layout_version_id) {
          throw new LocationsStoreError(
            "layout_version_id required",
            "INVALID_REQUEST"
          );
        }
        const layout = await activateLayout({ layout_version_id });
        data = { layout };
        break;
      }
      case "zone.upsert": {
        const team_id = requireTeamId(req);
        const layout_version_id = slotString(slots, "layout_version_id");
        const zone_type = slotString(slots, "zone_type");
        const zone_label = slotString(slots, "zone_label");
        if (!layout_version_id || !zone_type || !zone_label) {
          throw new LocationsStoreError(
            "layout_version_id, zone_type, zone_label required",
            "INVALID_REQUEST"
          );
        }
        const zone = await upsertZone({
          team_id,
          layout_version_id,
          zone_type,
          zone_label,
          zone_description: slotString(slots, "zone_description"),
          near_landmark: slotString(slots, "near_landmark"),
          placement_note: slotString(slots, "placement_note"),
        });
        data = { zone };
        break;
      }
      case "zone.set_items": {
        const team_id = requireTeamId(req);
        const zone_id = slotString(slots, "zone_id");
        if (!zone_id) {
          throw new LocationsStoreError("zone_id required", "INVALID_REQUEST");
        }
        const result = await setZoneItems({
          team_id,
          zone_id,
          items: parseItems(slots.items),
          mode: slots.mode === "replace" ? "replace" : "append",
        });
        data = result;
        break;
      }
      case "zone.publish": {
        const team_id = requireTeamId(req);
        const zone_id = slotString(slots, "zone_id");
        if (!zone_id) {
          throw new LocationsStoreError("zone_id required", "INVALID_REQUEST");
        }
        data = await publishZone({ team_id, zone_id });
        break;
      }
      case "map.resolve_item": {
        const place_id = slotString(slots, "place_id");
        const item_query = slotString(slots, "item_query");
        if (!place_id || !item_query) {
          throw new LocationsStoreError(
            "place_id and item_query required",
            "INVALID_REQUEST"
          );
        }
        data = await resolveItem({ place_id, item_query });
        break;
      }
      case "map.coverage": {
        const place_id = slotString(slots, "place_id");
        if (!place_id) {
          throw new LocationsStoreError("place_id required", "INVALID_REQUEST");
        }
        data = await getCoverage(place_id);
        break;
      }
      case "publication.get_place_map": {
        const place_id = slotString(slots, "place_id");
        if (!place_id) {
          throw new LocationsStoreError("place_id required", "INVALID_REQUEST");
        }
        data = await getPlaceMap(place_id);
        break;
      }
      default:
        return {
          ok: false,
          contract_version: LOCATIONS_API_CONTRACT_VERSION,
          error: `Unknown command: ${command}`,
          code: "UNKNOWN_COMMAND",
          command,
        };
    }

    return {
      ok: true,
      contract_version: LOCATIONS_API_CONTRACT_VERSION,
      command,
      data,
    };
  } catch (err) {
    if (err instanceof LocationsStoreError) {
      return {
        ok: false,
        contract_version: LOCATIONS_API_CONTRACT_VERSION,
        error: err.message,
        code: err.code,
        command,
      };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      contract_version: LOCATIONS_API_CONTRACT_VERSION,
      error: message,
      code: "INTERNAL_ERROR",
      command,
    };
  }
}

export function statusForCommandResult(
  result: LocationsCommandExecuteResponse
): number {
  if (result.ok) return 200;
  switch (result.code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "PLACE_NOT_FOUND":
    case "LAYOUT_NOT_FOUND":
    case "ZONE_NOT_FOUND":
    case "NOT_FOUND":
      return 404;
    case "UNKNOWN_COMMAND":
      return 400;
    case "NOT_IMPLEMENTED":
      return 501;
    case "SUPABASE_NOT_CONFIGURED":
      return 503;
    default:
      return 400;
  }
}
