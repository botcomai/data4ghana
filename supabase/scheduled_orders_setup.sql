-- ================================================
-- scheduled_orders table
-- Stores bulk orders that were deferred because the
-- same phone number already has a pending delivery.
-- Run this once in your Supabase SQL editor.
-- ================================================

CREATE TABLE IF NOT EXISTS public.scheduled_orders (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID             NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  network       TEXT             NOT NULL,
  phone         TEXT             NOT NULL,
  plan          TEXT             NOT NULL,           -- e.g. "5GB"
  amount        NUMERIC(10,2)    NOT NULL,
  status        TEXT             NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'processed' | 'cancelled'
  note          TEXT,                               -- e.g. "Multiple order — pending delivery already exists"
  scheduled_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_scheduled_orders_user_id ON public.scheduled_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_orders_phone   ON public.scheduled_orders(phone);
CREATE INDEX IF NOT EXISTS idx_scheduled_orders_status  ON public.scheduled_orders(status);

-- Row Level Security
ALTER TABLE public.scheduled_orders ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own scheduled orders
CREATE POLICY "Users can view own scheduled orders"
  ON public.scheduled_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled orders"
  ON public.scheduled_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled orders"
  ON public.scheduled_orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled orders"
  ON public.scheduled_orders FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all scheduled orders
CREATE POLICY "Admins can view all scheduled orders"
  ON public.scheduled_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
