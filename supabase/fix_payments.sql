-- ================================================
-- fix_payments.sql
-- Run this in your Supabase SQL Editor to resolve
-- Manual Transfer submission issues.
-- ================================================

-- 1. Correct RLS for public.users
-- Allows users to update their own wallet balance (needed for current frontend logic)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Ensure all required app_settings exist
INSERT INTO app_settings (key, value, description)
VALUES 
  ('manual_transfer_enabled', 'true', 'Enable/Disable Manual Transfer'),
  ('manual_momo_number', '0559623850', 'Agent Momo Number'),
  ('manual_momo_name', 'Data4Ghana Enterprise', 'Agent Momo Name')
ON CONFLICT (key) DO NOTHING;

-- 3. Ensure transactions table allows insertion by users
DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
CREATE POLICY "transactions_insert_own"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. Ensure app_settings are readable by authenticated users
DROP POLICY IF EXISTS "Authenticated users can read app settings" ON public.app_settings;
CREATE POLICY "Authenticated users can read app settings"
    ON public.app_settings
    FOR SELECT
    USING (auth.role() = 'authenticated');
