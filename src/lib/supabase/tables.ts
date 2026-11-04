/**
 * Physical table names in the shared Supabase project (with booking).
 * Leading `_locations_` keeps them sorted together in the dashboard.
 */
export const LOCATIONS_TABLES = {
  places: "_locations_places",
  placeBots: "_locations_place_bots",
  placeLayoutVersions: "_locations_place_layout_versions",
  zones: "_locations_zones",
  zoneItems: "_locations_zone_items",
  zonePublications: "_locations_zone_publications",
} as const;
