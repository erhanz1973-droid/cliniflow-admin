-- Clinifly Database Schema
-- Run this in Supabase SQL Editor

-- ================== EXTENSIONS ==================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================== CLINICS TABLE ==================
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  plan TEXT DEFAULT 'FREE', -- FREE, BASIC, PRO
  max_patients INTEGER DEFAULT 3,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clinics_clinic_code ON clinics(clinic_code);
CREATE INDEX IF NOT EXISTS idx_clinics_email ON clinics(email);

-- ================== ADMINS TABLE ==================
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'admin', -- admin, staff, readonly
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, email)
);

CREATE INDEX IF NOT EXISTS idx_admins_clinic_id ON admins(clinic_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

-- ================== ADMIN TOKENS TABLE ==================
CREATE TABLE IF NOT EXISTS admin_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_tokens_token ON admin_tokens(token);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_clinic_id ON admin_tokens(clinic_id);

-- ================== PATIENTS TABLE ==================
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY, -- p_xxxxx format
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  token TEXT,
  referral_code TEXT,
  referred_by TEXT,
  travel JSONB DEFAULT '{}',
  health JSONB DEFAULT '{}',
  treatments JSONB DEFAULT '[]',
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_referral_code ON patients(referral_code);

-- ================== OTPs TABLE ==================
CREATE TABLE IF NOT EXISTS otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at);

-- ================== REFERRALS TABLE ==================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  referrer_patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  referred_patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, CONVERTED, EXPIRED
  reward_status TEXT DEFAULT 'PENDING', -- PENDING, PAID, CANCELLED
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_clinic_id ON referrals(clinic_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON referrals(referral_code);

-- ================== PUSH SUBSCRIPTIONS TABLE ==================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_patient_id ON push_subscriptions(patient_id);

-- ================== TREATMENT PRICES TABLE ==================
CREATE TABLE IF NOT EXISTS treatment_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  treatment_code TEXT NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(10,2),
  currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, treatment_code)
);

CREATE INDEX IF NOT EXISTS idx_treatment_prices_clinic_id ON treatment_prices(clinic_id);

-- ================== PAYMENTS TABLE ==================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  status TEXT DEFAULT 'PENDING', -- PENDING, PAID, REFUNDED
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_clinic_id ON payments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments(patient_id);

-- ================== UPDATED_AT TRIGGER ==================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_clinics_updated_at ON clinics;
CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON clinics
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_treatment_prices_updated_at ON treatment_prices;
CREATE TRIGGER update_treatment_prices_updated_at BEFORE UPDATE ON treatment_prices
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================== RLS POLICIES (Optional - for extra security) ==================
-- Uncomment if you want Row Level Security

-- ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ================== CLEANUP OLD OTPs (Run periodically) ==================
-- DELETE FROM otps WHERE expires_at < NOW() - INTERVAL '1 day';
