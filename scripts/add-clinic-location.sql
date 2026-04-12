-- ============================================================
-- Add GPS coordinates to clinics for distance-based sorting
-- Run once in Supabase SQL Editor
-- ============================================================

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Partial index: only rows with coordinates are queried for distance
CREATE INDEX IF NOT EXISTS idx_clinics_location
  ON clinics (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Verify
SELECT id, name, city, latitude, longitude
FROM clinics
LIMIT 5;
