-- ================================================
-- add_business_region_to_users.sql
-- Adds business_name and region columns to the users table
-- and updates the handle_new_user trigger function.
-- ================================================

-- 1. Add columns to public.users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS region TEXT;

-- 2. Update handle_new_user() trigger function
-- This function syncs Auth meta data to the public.users table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, 
    email, 
    phone, 
    first_name, 
    last_name, 
    business_name, 
    region
  )
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.phone, new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'region'
  );
  RETURN new;
END;
$$;
