-- Locations sibling core schema (Phase 1 organic path)
-- Shared Supabase with booking: all locations tables use `_locations_` prefix
-- so they sort together and stay visually isolated from booking tables.
-- team_id / bot_id are ChatIQ UUIDs stored as plain uuid (no cross-DB FKs).

CREATE TABLE IF NOT EXISTS _locations_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  primary_bot_id uuid,
  name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS _locations_place_bots (
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, bot_id)
);

CREATE TABLE IF NOT EXISTS _locations_place_layout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Current layout',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  notes text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS _locations_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  layout_version_id uuid NOT NULL REFERENCES _locations_place_layout_versions(id) ON DELETE CASCADE,
  parent_zone_id uuid REFERENCES _locations_zones(id) ON DELETE SET NULL,
  zone_type text NOT NULL,
  zone_label text NOT NULL,
  zone_description text,
  near_landmark text,
  placement_note text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Manual / organic items on a zone (vision observations come later).
CREATE TABLE IF NOT EXISTS _locations_zone_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  zone_id uuid NOT NULL REFERENCES _locations_zones(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  raw_label text,
  brand text,
  variant text,
  size_text text,
  category_labels text[],
  shelf_hint text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS _locations_zone_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  layout_version_id uuid NOT NULL REFERENCES _locations_place_layout_versions(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES _locations_zones(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'superseded', 'archived')),
  is_current boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_places_team_id ON _locations_places(team_id);
CREATE INDEX IF NOT EXISTS idx_locations_places_primary_bot_id ON _locations_places(primary_bot_id);
CREATE INDEX IF NOT EXISTS idx_locations_places_is_active ON _locations_places(is_active);

CREATE INDEX IF NOT EXISTS idx_locations_place_bots_bot_id ON _locations_place_bots(bot_id);

CREATE INDEX IF NOT EXISTS idx_locations_place_layout_versions_team_id ON _locations_place_layout_versions(team_id);
CREATE INDEX IF NOT EXISTS idx_locations_place_layout_versions_place_id ON _locations_place_layout_versions(place_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_place_layout_versions_active_per_place
  ON _locations_place_layout_versions(place_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_locations_zones_team_id ON _locations_zones(team_id);
CREATE INDEX IF NOT EXISTS idx_locations_zones_place_id ON _locations_zones(place_id);
CREATE INDEX IF NOT EXISTS idx_locations_zones_layout_version_id ON _locations_zones(layout_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_zones_active_unique_label
  ON _locations_zones(layout_version_id, zone_type, zone_label)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_locations_zone_items_zone_id ON _locations_zone_items(zone_id);
CREATE INDEX IF NOT EXISTS idx_locations_zone_items_canonical_name ON _locations_zone_items(canonical_name);

CREATE INDEX IF NOT EXISTS idx_locations_zone_publications_place_id ON _locations_zone_publications(place_id);
CREATE INDEX IF NOT EXISTS idx_locations_zone_publications_zone_id ON _locations_zone_publications(zone_id);
CREATE INDEX IF NOT EXISTS idx_locations_zone_publications_status ON _locations_zone_publications(publication_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_zone_publications_current_per_zone
  ON _locations_zone_publications(zone_id)
  WHERE is_current = true;

COMMENT ON TABLE _locations_places IS 'Physical sites (stores). team_id/bot_id reference ChatIQ, no FK. Prefix _locations_ for shared-DB sort isolation.';
COMMENT ON TABLE _locations_zone_items IS 'Organic/manual items on a zone before or without vision extract.';
COMMENT ON TABLE _locations_zone_publications IS 'Published zone knowledge for concierge resolve.';
