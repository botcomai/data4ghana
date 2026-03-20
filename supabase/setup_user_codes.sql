-- ================================================
-- setup_user_codes.sql
-- Implements auto-generation of unique user codes: D4G-XXX
-- ================================================

-- 1. Create a sequence for user codes starts at 1
CREATE SEQUENCE IF NOT EXISTS public.user_code_seq START 1;

-- 2. Update handle_new_user() trigger function
-- This version captures metadata AND generates the D4G code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  next_val BIGINT;
BEGIN
  -- Get next sequence value
  SELECT nextval('public.user_code_seq') INTO next_val;
  
  -- Format as D4G-001, D4G-002, etc.
  new_code := 'D4G-' || LPAD(next_val::TEXT, 3, '0');

  INSERT INTO public.users (
    id, 
    email, 
    phone, 
    first_name, 
    last_name, 
    business_name, 
    region,
    merchant_id
  )
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.phone, new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'region',
    new_code
  );
  RETURN new;
END;
$$;

-- 3. One-time Backfill for existing users without a code
DO $$
DECLARE
  u RECORD;
  new_code TEXT;
  next_val BIGINT;
BEGIN
  FOR u IN SELECT id FROM public.users WHERE merchant_id IS NULL OR merchant_id = '' ORDER BY created_at ASC LOOP
    SELECT nextval('public.user_code_seq') INTO next_val;
    new_code := 'D4G-' || LPAD(next_val::TEXT, 3, '0');
    
    UPDATE public.users SET merchant_id = new_code WHERE id = u.id;
  END LOOP;
END;
$$;
