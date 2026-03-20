-- ================================================
-- seed_dynamic_pricing.sql
-- Paste this script into your Supabase SQL Editor
-- to ensure the Pricing Matrix starts with data.
-- ================================================

-- Create function to safely seed missing data products
CREATE OR REPLACE FUNCTION public.seed_default_pricing()
RETURNS void AS $$
DECLARE
    r TEXT;
    p TEXT;
    base_price NUMERIC;
    roles TEXT[] := ARRAY['client', 'vip_customer', 'elite_agent', 'super_agent', 'admin'];
    products TEXT[] := ARRAY['data_mtn', 'data_telecel', 'data_tigo', 'data_bigtime'];
BEGIN
    FOREACH r IN ARRAY roles
    LOOP
        -- Determine base price offset by role
        IF r = 'client' THEN base_price := 5.00;
        ELSIF r = 'vip_customer' THEN base_price := 4.50;
        ELSIF r = 'elite_agent' THEN base_price := 4.00;
        ELSIF r = 'super_agent' THEN base_price := 3.50;
        ELSE base_price := 3.00; -- admin
        END IF;

        FOREACH p IN ARRAY products
        LOOP
            INSERT INTO public.pricing (role, product, price)
            VALUES (r, p, base_price)
            ON CONFLICT (role, product) DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the seeder
SELECT public.seed_default_pricing();

-- Drop the function to clean up
DROP FUNCTION public.seed_default_pricing();
