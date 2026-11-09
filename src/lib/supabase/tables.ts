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
  captureSets: "_locations_capture_sets",
  captureAssets: "_locations_capture_assets",
  extractJobs: "_locations_extract_jobs",
} as const;

export const LOCATIONS_CAPTURE_BUCKET = "locations-capture";
export const MAX_ASSETS_PER_CAPTURE_SET = 24;
export const CAPTURE_SUCCESS_RETAIN_DAYS = 7;
export const CAPTURE_FAILED_RETAIN_DAYS = 14;
