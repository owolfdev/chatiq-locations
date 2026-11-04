-- Locations sibling core schema (Phase 1 organic path)
-- team_id / bot_id are ChatIQ UUIDs stored as plain uuid (no cross-DB FKs).

CREATE TABLE IF NOT EXISTS places (
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

CREATE TABLE IF NOT EXISTS place_bots (
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, bot_id)
);

CREATE TABLE IF NOT EXISTS place_layout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Current layout',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  notes text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  layout_version_id uuid NOT NULL REFERENCES place_layout_versions(id) ON DELETE CASCADE,
  parent_zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
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
CREATE TABLE IF NOT EXISTS zone_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS zone_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  layout_version_id uuid NOT NULL REFERENCES place_layout_versions(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_places_team_id ON places(team_id);
CREATE INDEX IF NOT EXISTS idx_places_primary_bot_id ON places(primary_bot_id);
CREATE INDEX IF NOT EXISTS idx_places_is_active ON places(is_active);

CREATE INDEX IF NOT EXISTS idx_place_bots_bot_id ON place_bots(bot_id);

CREATE INDEX IF NOT EXISTS idx_place_layout_versions_team_id ON place_layout_versions(team_id);
CREATE INDEX IF NOT EXISTS idx_place_layout_versions_place_id ON place_layout_versions(place_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_place_layout_versions_active_per_place
  ON place_layout_versions(place_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_zones_team_id ON zones(team_id);
CREATE INDEX IF NOT EXISTS idx_zones_place_id ON zones(place_id);
CREATE INDEX IF NOT EXISTS idx_zones_layout_version_id ON zones(layout_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zones_active_unique_label
  ON zones(layout_version_id, zone_type, zone_label)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_zone_items_zone_id ON zone_items(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_items_canonical_name ON zone_items(canonical_name);

CREATE INDEX IF NOT EXISTS idx_zone_publications_place_id ON zone_publications(place_id);
CREATE INDEX IF NOT EXISTS idx_zone_publications_zone_id ON zone_publications(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_publications_status ON zone_publications(publication_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zone_publications_current_per_zone
  ON zone_publications(zone_id)
  WHERE is_current = true;

COMMENT ON TABLE places IS 'Physical sites (stores). team_id/bot_id reference ChatIQ, no FK.';
COMMENT ON TABLE zone_items IS 'Organic/manual items on a zone before or without vision extract.';
COMMENT ON TABLE zone_publications IS 'Published zone knowledge for concierge resolve.';
