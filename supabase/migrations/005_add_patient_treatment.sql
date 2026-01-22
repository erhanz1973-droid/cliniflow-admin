-- Add treatment (v1) JSONB column to patients
-- Kept separate from legacy `treatments` (array) to avoid breaking existing UI.

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS treatment JSONB DEFAULT '{}'::jsonb;

