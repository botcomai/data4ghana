-- ================================================
-- manage_afa_pricing.sql
-- Allows admins to manage AFA Registration prices
-- dynamically for different user roles.
-- ================================================

-- 1. Ensure the AFA products exist in the pricing table for all roles
-- This pre-fills the table if entries are missing.

-- Insert/Update AFA Premium Pricing
INSERT INTO public.pricing (product, role, price)
VALUES 
  ('afa_premium', 'client', 10.00),
  ('afa_premium', 'vip_customer', 25.00),
  ('afa_premium', 'elite_agent', 20.00),
  ('afa_premium', 'super_agent', 15.00)
ON CONFLICT (product, role) 
DO UPDATE SET price = EXCLUDED.price;

-- Insert/Update AFA Normal Pricing
INSERT INTO public.pricing (product, role, price)
VALUES 
  ('afa_normal', 'client', 25.00),
  ('afa_normal', 'vip_customer', 20.00),
  ('afa_normal', 'elite_agent', 15.00),
  ('afa_normal', 'super_agent', 10.00)
ON CONFLICT (product, role) 
DO UPDATE SET price = EXCLUDED.price;

-- 2. Convenience Function for Admins to Update a Specific Price
-- Usage: SELECT public.update_afa_price('afa_premium', 'client', 35.00);
CREATE OR REPLACE FUNCTION public.update_afa_price(
  p_product TEXT,
  p_role    TEXT,
  p_new_price NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Basic check if user is admin (optional, depending on who runs the SQL)
  -- IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE public.pricing
  SET price = p_new_price
  WHERE product = p_product AND role = p_role;

  -- If no row was updated, insert it
  IF NOT FOUND THEN
    INSERT INTO public.pricing (product, role, price)
    VALUES (p_product, p_role, p_new_price);
  END IF;
END;
$$;
