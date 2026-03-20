-- Initialize essential app settings for API and general configuration
-- Run this in the Supabase SQL Editor

INSERT INTO app_settings (key, value, description) 
VALUES 
    -- DatarJust API
    ('datarjust_api_key', '', 'API Key for DatarJust API'),
    ('datarjust_api_enabled', 'false', 'Master toggle for API integration'),
    ('api_auto_order', 'false', 'Automatic order fulfillment toggle'),
    
    -- Manual / Agent Payments
    ('manual_transfer_enabled', 'true', 'Toggle for Manual Bank Transfer'),
    ('manual_momo_number', '0000000000', 'Momo Number for manual payments'),
    ('manual_momo_name', 'System Admin', 'Momo Name for manual payments')
ON CONFLICT (key) DO NOTHING;

-- 4. Standardize Transaction Statuses
-- This fixes visibility issues caused by case-sensitivity (e.g. 'Pending' vs 'pending')
UPDATE public.transactions SET status = lower(status);
ALTER TABLE public.transactions ALTER COLUMN status SET DEFAULT 'pending';

-- Also ensure columns are present in orders (for reference)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS api_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS api_response TEXT;
