-- Add treatment events storage on patients
-- Keeps treatment and travel fully independent.

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS treatment_events JSONB DEFAULT '[]'::jsonb;

