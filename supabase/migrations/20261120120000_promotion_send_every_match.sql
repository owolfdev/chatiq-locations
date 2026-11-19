-- Demo switch. Off means once per conversation. On means every keyword match sends again.

ALTER TABLE _locations_promotions
  ADD COLUMN IF NOT EXISTS send_every_match boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN _locations_promotions.send_every_match IS
  'When false, the offer is sent once per conversation. When true, every keyword match sends it again.';
