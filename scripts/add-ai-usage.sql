-- Migration: ai_usage table
-- Tracks accumulated AI cost per user.
-- Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS ai_usage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text        NOT NULL UNIQUE,   -- patient UUID (maps to patients.id)
  total_cost float       NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast single-user lookups
CREATE INDEX IF NOT EXISTS ai_usage_user_id_idx ON ai_usage (user_id);

-- RLS: only the service role can read/write (backend uses service-role key)
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- No public access — all access via backend service-role key
CREATE POLICY "service_role_only" ON ai_usage
  USING (false)
  WITH CHECK (false);
