-- ================================================
-- admin_fetching_setup.sql
-- Fixes RLS recursion on public.users and provides 
-- administrative functions for user management.
-- ================================================

-- 1. Helper function to check admin status without recursion
-- SECURITY DEFINER allows this function to bypass RLS checks
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2. Update RLS Policies on public.users
-- We drop the old recursive policy and add a clean one
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.users;
CREATE POLICY "Admins can read all profiles"
  ON public.users FOR SELECT
  USING (public.is_admin());

-- 3. Ensure admin_update_role is robust
-- This function is used by the admin dashboard to manage users
CREATE OR REPLACE FUNCTION public.admin_update_role(
  target_user_id UUID,
  new_role       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$$;

-- 4. Admin Wallet Adjustment (Optimization)
-- If not already present, ensures admins can adjust balances securely
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  target_user_id UUID,
  amount_change  NUMERIC,
  trx_type       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bal NUMERIC;
  new_bal     NUMERIC;
  trx_id      UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT wallet_balance INTO current_bal
  FROM   public.users
  WHERE  id = target_user_id
  FOR UPDATE;

  IF current_bal IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  new_bal := current_bal + amount_change;

  UPDATE public.users
  SET    wallet_balance = new_bal
  WHERE  id = target_user_id;

  INSERT INTO public.transactions
    (user_id, type, amount, balance_before, balance_after, status)
  VALUES
    (target_user_id, trx_type, abs(amount_change), current_bal, new_bal, 'Verified')
  RETURNING id INTO trx_id;

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', new_bal,
    'trx_id',      trx_id
  );
END;
$$;
