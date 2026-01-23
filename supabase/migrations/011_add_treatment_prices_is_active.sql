ALTER TABLE treatment_prices
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

UPDATE treatment_prices
SET is_active = TRUE
WHERE is_active IS NULL;
