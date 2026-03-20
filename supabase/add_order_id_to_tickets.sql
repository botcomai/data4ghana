-- ==========================================
-- setup_support_tickets.sql
-- Creates or updates the support_tickets table
-- to include order tracking.
-- ==========================================

-- 1. Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id       UUID        REFERENCES public.orders(id) ON DELETE SET NULL, -- NEW: Linked Order
  phone          TEXT        NOT NULL,
  issue          TEXT        NOT NULL,
  screenshot_url TEXT,
  status         TEXT        NOT NULL DEFAULT 'checking',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure columns exist if table was already there
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- 3. Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_st_user   ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_st_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_st_order  ON public.support_tickets(order_id);

-- 4. Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 5. Policies
DROP POLICY IF EXISTS "st_sel_own"   ON public.support_tickets;
DROP POLICY IF EXISTS "st_ins_own"   ON public.support_tickets;
DROP POLICY IF EXISTS "st_admin_all" ON public.support_tickets;

CREATE POLICY "st_sel_own" ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "st_ins_own" ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "st_admin_all" ON public.support_tickets FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
