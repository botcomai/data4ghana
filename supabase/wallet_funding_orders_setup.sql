-- ===============================================
-- WALLET FUNDING ORDERS TABLE
-- Track user wallet funding attempts with status
-- ===============================================

CREATE TABLE IF NOT EXISTS public.wallet_funding_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reference TEXT UNIQUE NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'GHS',
  gateway_reference TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create index on reference for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_orders_reference
  ON public.wallet_funding_orders (LOWER(reference));

-- Create index on user_id for fast filtering
CREATE INDEX IF NOT EXISTS idx_wallet_orders_user_id
  ON public.wallet_funding_orders (user_id);

-- Create index on status for filtering by status
CREATE INDEX IF NOT EXISTS idx_wallet_orders_status
  ON public.wallet_funding_orders (status);

-- Enable RLS
ALTER TABLE public.wallet_funding_orders ENABLE ROW LEVEL SECURITY;

-- Users can see their own orders
DROP POLICY IF EXISTS "wfo_select_own" ON public.wallet_funding_orders;
CREATE POLICY "wfo_select_own"
  ON public.wallet_funding_orders FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own orders
DROP POLICY IF EXISTS "wfo_insert_own" ON public.wallet_funding_orders;
CREATE POLICY "wfo_insert_own"
  ON public.wallet_funding_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can see all
DROP POLICY IF EXISTS "wfo_admin_all" ON public.wallet_funding_orders;
CREATE POLICY "wfo_admin_all"
  ON public.wallet_funding_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid() AND role IN ('admin')
    )
  );
