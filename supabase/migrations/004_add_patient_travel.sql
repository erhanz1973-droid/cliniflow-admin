-- Add/ensure travel-related columns on patients

-- Travel JSONB
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS travel JSONB DEFAULT '{}'::jsonb;

-- Health JSONB (some environments already have it)
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS health JSONB DEFAULT '{}'::jsonb;

-- Optional external patient identifier (p_xxx). Some environments use this as primary key.
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS patient_id TEXT;

-- Best-effort backfill: only when the primary key is already p_xxx
UPDATE patients
SET patient_id = id
WHERE patient_id IS NULL
  AND id LIKE 'p_%';

-- Indexes for faster lookup by patient_id
CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_id_unique ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);

