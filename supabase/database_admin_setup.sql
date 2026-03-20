-- ================================================
-- database_admin_setup.sql  (idempotent — safe to re-run)
-- Run this in your Supabase SQL Editor.
-- ================================================

-- ── 1. USERS TABLE: ensure role column exists ─
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- ── 2. ORDERS TABLE ─────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  network    TEXT        NOT NULL,
  phone      TEXT        NOT NULL,
  plan       TEXT        NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone   ON public.orders(phone);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_own"  ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own"  ON public.orders;
DROP POLICY IF EXISTS "orders_admin_all"   ON public.orders;

CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "orders_insert_own"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders_admin_all"
  ON public.orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin')
    )
  );

-- ── 3. TRANSACTIONS TABLE ───────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  balance_before NUMERIC(12,2),
  balance_after  NUMERIC(12,2),
  reference      TEXT,
  status         TEXT        NOT NULL DEFAULT 'Pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_admin_all"  ON public.transactions;

CREATE POLICY "transactions_select_own"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert_own"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_admin_all"
  ON public.transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin')
    )
  );

-- ── 4. ADMIN POSTGRES FUNCTIONS ────────────

-- 4a. Update any user's role (secure, admin-only)
CREATE OR REPLACE FUNCTION admin_update_role(
  target_user_id UUID,
  new_role       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$$;

-- 4b. Credit or debit a user's wallet (admin-only, logs a transaction)
CREATE OR REPLACE FUNCTION admin_adjust_wallet(
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
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock the row so concurrent calls don't race
  SELECT wallet_balance INTO current_bal
  FROM   public.users
  WHERE  id = target_user_id
  FOR UPDATE;

  IF current_bal IS NULL THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
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
    'success',        true,
    'new_balance',    new_bal,
    'transaction_id', trx_id
  );
END;
$$;

-- 4c. Resolve a support ticket (admin-only)
CREATE OR REPLACE FUNCTION admin_resolve_ticket(
  ticket_id  UUID,
  new_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.support_tickets
  SET    status = new_status, updated_at = NOW()
  WHERE  id = ticket_id;
END;
$$;
