-- ==========================================
-- 01_core_tables.sql
-- Creates the required base tables (users & orders)
-- so that other features can link to them.
-- ==========================================

-- 1. USERS TABLE (Minimal Required Fields)
CREATE TABLE IF NOT EXISTS public.users (
  id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT        UNIQUE NOT NULL,
  phone          TEXT        UNIQUE,
  first_name     TEXT,
  last_name      TEXT,
  role           TEXT        NOT NULL DEFAULT 'client',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own profile" ON public.users;
CREATE POLICY "Users view own profile" ON public.users FOR SELECT USING (auth.uid() = id);

-- 2. ORDERS TABLE (Minimal Required Fields)
CREATE TABLE IF NOT EXISTS public.orders (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  network        TEXT        NOT NULL,
  phone          TEXT        NOT NULL,
  plan           TEXT        NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
CREATE POLICY "Users view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own orders" ON public.orders;
CREATE POLICY "Users insert own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
