-- Add referral_state to patients for referral discount tracking

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS referral_state JSONB DEFAULT '{}'::jsonb;
