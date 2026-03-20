-- ================================================
-- fix_resilient_signup.sql
-- Run this in your Supabase SQL Editor to resolve
-- persistent "Database error saving new user" issues.
-- ================================================

-- 1. Create a secure RPC for phone checking
-- This allows unauthenticated users to check if a phone number exists
-- without giving them read access to the entire users table.
CREATE OR REPLACE FUNCTION public.check_phone_exists(phone_val TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users WHERE phone = phone_val
  );
END;
$$;

-- Grant access to both authenticated and anon users
GRANT EXECUTE ON FUNCTION public.check_phone_exists(TEXT) TO anon, authenticated;

-- 2. Make handle_new_user trigger more resilient
-- Uses ON CONFLICT to avoid failing if the profile already exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, phone, first_name, last_name)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.phone, (new.raw_user_meta_data->>'phone')::TEXT, (new.raw_user_meta_data->>'phone_number')::TEXT),
    (new.raw_user_meta_data->>'first_name')::TEXT,
    (new.raw_user_meta_data->>'last_name')::TEXT
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    phone = COALESCE(public.users.phone, EXCLUDED.phone),
    first_name = COALESCE(public.users.first_name, EXCLUDED.first_name),
    last_name = COALESCE(public.users.last_name, EXCLUDED.last_name),
    updated_at = NOW();
    
  RETURN new;
END;
$$;

-- 3. Re-ensure the trigger is correctly attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Re-ensure public.users has proper RLS for the signup check indirectly
-- (The RPC handles the security so we don't need to open the table itself)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
