-- ================================================
-- EXTRAS_SETUP.SQL
-- Enhancements for Manual Payments, Granular Pricing & Stock
-- ================================================

-- 1. Update app_settings with Manual Payment Details
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('manual_momo_number', '0559623850', 'Account number for manual transfers'),
  ('manual_momo_name', 'Data4Ghana Enterprise', 'Account name for manual transfers')
ON CONFLICT (key) DO NOTHING;

-- 2. Enhance Pricing Table for specific GB sizes and Stock
ALTER TABLE public.pricing ADD COLUMN IF NOT EXISTS gb_size NUMERIC(10,2);
ALTER TABLE public.pricing ADD COLUMN IF NOT EXISTS is_in_stock BOOLEAN DEFAULT true;

-- Update unique constraint to include gb_size
-- First drop existing unique constraint if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_role_product_key') THEN
        ALTER TABLE public.pricing DROP CONSTRAINT pricing_role_product_key;
    END IF;
END $$;

-- Add new composite unique constraint
ALTER TABLE public.pricing ADD CONSTRAINT pricing_role_product_gb_key UNIQUE (role, product, gb_size);

-- Seed some granular data if needed (optional, just to show it works)
-- UPDATE public.pricing SET gb_size = 1.0 WHERE product LIKE 'data_%' AND gb_size IS NULL;
