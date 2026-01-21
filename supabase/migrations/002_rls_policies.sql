-- RLS Policies for Clinifly
-- Run this in Supabase SQL Editor AFTER creating tables

-- ================== DISABLE RLS (TEMPORARY FOR DEBUG) ==================
-- Option 1: Disable RLS completely (easiest for backend with service_role key)

ALTER TABLE clinics DISABLE ROW LEVEL SECURITY;
ALTER TABLE patients DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE otps DISABLE ROW LEVEL SECURITY;
ALTER TABLE referrals DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_prices DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- ================== OR: ENABLE RLS WITH PERMISSIVE POLICIES ==================
-- If you want RLS enabled but want service_role to bypass it, use this instead:
-- (Uncomment below and comment out the DISABLE statements above)

/*
-- Enable RLS
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Allow all for authenticated service role (backend)
-- Note: service_role key bypasses RLS by default, but these policies
-- ensure visibility in Supabase Dashboard

CREATE POLICY "allow_all_clinics" ON clinics
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_patients" ON patients
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_admins" ON admins
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_admin_tokens" ON admin_tokens
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_otps" ON otps
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_referrals" ON referrals
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_push_subscriptions" ON push_subscriptions
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_treatment_prices" ON treatment_prices
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_payments" ON payments
FOR ALL USING (true) WITH CHECK (true);
*/

-- ================== VERIFY ==================
-- Run this to check RLS status:
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('clinics', 'patients', 'admins', 'otps');
