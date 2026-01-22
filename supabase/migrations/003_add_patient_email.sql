-- Add email column to patients (production hotfix)
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS email TEXT;

-- Optional unique index for patient email
CREATE UNIQUE INDEX IF NOT EXISTS patients_email_unique ON patients(email);
