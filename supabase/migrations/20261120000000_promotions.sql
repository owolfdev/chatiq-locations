-- Branch promotions. Match words, offer text, and a public image.
-- A row is live only from starts_at until ends_at.

CREATE TABLE IF NOT EXISTS _locations_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  place_id uuid NOT NULL REFERENCES _locations_places(id) ON DELETE CASCADE,
  keywords text NOT NULL,
  body text,
  image_path text,
  image_url text,
  image_prompt text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT _locations_promotions_duration CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_locations_promotions_place_window
  ON _locations_promotions (place_id, starts_at, ends_at);

COMMENT ON TABLE _locations_promotions IS
  'Offers for one branch. keywords are the shopper phrases that surface the offer.';
COMMENT ON COLUMN _locations_promotions.keywords IS
  'Match phrases, separated by commas or new lines.';
COMMENT ON COLUMN _locations_promotions.body IS
  'Text delivered with the offer. Empty means image only.';
COMMENT ON COLUMN _locations_promotions.image_url IS
  'Public image URL. Empty means text only.';
COMMENT ON COLUMN _locations_promotions.image_prompt IS
  'Prompt used to generate the image, when one was generated.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'locations-promotions',
  'locations-promotions',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Public read locations promotions" ON storage.objects;
CREATE POLICY "Public read locations promotions"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'locations-promotions');
