-- ================================================
-- allow_admin_wallet_update.sql
-- Allows admins to update user wallet balances
-- Run this in Supabase SQL Editor
-- ================================================

-- Add policy to allow admins to update user wallet_balance
DROP POLICY IF EXISTS "Admins can update user wallet" ON public.users;
CREATE POLICY "Admins can update user wallet"
  ON public.users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users admin
      WHERE admin.id = auth.uid() AND admin.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users admin
      WHERE admin.id = auth.uid() AND admin.role = 'admin'
    )
  );

-- Also allow users to update their own wallet_balance
DROP POLICY IF EXISTS "Users can update own wallet" ON public.users;
CREATE POLICY "Users can update own wallet"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Verify the policies
SELECT policyname, permissive, roles, qual FROM pg_policies WHERE tablename = 'users' ORDER BY policyname;
