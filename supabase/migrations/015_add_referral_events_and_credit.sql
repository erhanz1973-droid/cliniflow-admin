-- Referral events + referral credit tracking

CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  inviter_patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  invitee_patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  invitee_payment_id TEXT UNIQUE NOT NULL,
  invitee_paid_amount NUMERIC,
  inviter_paid_amount NUMERIC,
  base_paid_amount NUMERIC,
  currency TEXT DEFAULT 'EUR',
  inviter_rate NUMERIC,
  invitee_rate NUMERIC,
  earned_discount_amount NUMERIC,
  status TEXT DEFAULT 'EARNED', -- EARNED, REVERSED
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_clinic_id ON referral_events(clinic_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_inviter ON referral_events(inviter_patient_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_invitee ON referral_events(invitee_patient_id);

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS referral_credit NUMERIC DEFAULT 0;

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS referral_credit_updated_at TIMESTAMPTZ;
