-- Persistent chat messages (patient <-> clinic/admin)
-- Single source of truth: Supabase

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL,
  sender TEXT NOT NULL, -- 'patient' | 'clinic' | 'admin'
  message TEXT,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messages_patient_idx ON messages(patient_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);

