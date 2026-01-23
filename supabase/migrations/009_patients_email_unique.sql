-- Ensure patients.email is unique (required for upsert onConflict: "email")
-- NOTE: This may fail if duplicate emails already exist in production.

CREATE UNIQUE INDEX IF NOT EXISTS patients_email_unique
ON public.patients (email);

