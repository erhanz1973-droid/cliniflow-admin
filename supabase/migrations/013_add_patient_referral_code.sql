-- Add referral_code to patients for referral matching

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_referral_code ON patients(referral_code);
