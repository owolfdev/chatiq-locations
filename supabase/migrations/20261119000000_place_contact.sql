-- Store-level contact details. Zone notes stay on _locations_zones.
ALTER TABLE _locations_places
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS contact text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN _locations_places.phone IS 'Store phone number.';
COMMENT ON COLUMN _locations_places.website IS 'Store website.';
COMMENT ON COLUMN _locations_places.contact IS 'Who to reach, such as a person or email.';
COMMENT ON COLUMN _locations_places.notes IS 'Notes about the store itself, not an aisle.';
