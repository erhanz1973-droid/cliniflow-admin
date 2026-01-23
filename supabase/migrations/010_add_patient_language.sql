-- Add patient language preference (patient attribute)
-- Used for OTP emails and app-wide i18n defaults.

ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

CREATE INDEX IF NOT EXISTS patients_language_idx
ON public.patients (language);

