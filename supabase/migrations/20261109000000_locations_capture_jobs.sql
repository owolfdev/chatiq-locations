-- Survey capture sets + background extract jobs (Phase 2)
-- Apply in Supabase SQL Editor after core v0.

CREATE TABLE IF NOT EXISTS _locations_capture_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  zone_type text NOT NULL DEFAULT 'aisle',
  zone_label text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',
      'ready',
      'processing',
      'draft_ready',
      'failed',
      'discarded'
    )),
  pose_summary text,
  asset_count integer NOT NULL DEFAULT 0,
  draft_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS _locations_capture_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES _locations_capture_sets(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  byte_size integer,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  extract_status text NOT NULL DEFAULT 'pending'
    CHECK (extract_status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  extract_error text,
  extract_payload jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS _locations_extract_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES _locations_capture_sets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'draft_ready', 'failed', 'cancelled')),
  images_total integer NOT NULL DEFAULT 0,
  images_done integer NOT NULL DEFAULT 0,
  failure_reason text,
  draft_text text,
  result_json jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  retain_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_capture_sets_place
  ON _locations_capture_sets(place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_capture_sets_status
  ON _locations_capture_sets(status);
CREATE INDEX IF NOT EXISTS idx_locations_capture_assets_set
  ON _locations_capture_assets(set_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_locations_capture_assets_extract
  ON _locations_capture_assets(extract_status)
  WHERE extract_status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_locations_extract_jobs_queue
  ON _locations_extract_jobs(status, created_at)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_locations_extract_jobs_retain
  ON _locations_extract_jobs(retain_until)
  WHERE retain_until IS NOT NULL;

-- Private evidence bucket (service role + signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'locations-capture',
  'locations-capture',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
