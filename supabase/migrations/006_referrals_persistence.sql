-- Referral persistence extensions (v2)
-- Keep existing referrals table; add fields needed for invited/registered/completed/cancelled flow.

-- Reward fields
ALTER TABLE referrals
ADD COLUMN IF NOT EXISTS reward_amount NUMERIC;

ALTER TABLE referrals
ADD COLUMN IF NOT EXISTS reward_currency TEXT DEFAULT 'EUR';

-- Completion timestamp (only set when status transitions to 'completed')
ALTER TABLE referrals
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Unique referral_code (prevents duplicates)
-- NOTE: If your production data already has duplicate referral_code values, this will fail and must be cleaned up first.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_code_unique ON referrals(referral_code);

-- Helpful index for patient lookups
CREATE INDEX IF NOT EXISTS referrals_inviter_idx ON referrals(inviter_patient_id);
CREATE INDEX IF NOT EXISTS referrals_invited_idx ON referrals(invited_patient_id);

