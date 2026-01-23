-- Add treatments (v2) JSONB column to patients
-- This is the primary storage for treatment plans (teeth/procedures).

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS treatments JSONB DEFAULT '{}'::jsonb;
