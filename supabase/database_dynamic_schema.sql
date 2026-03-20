-- ================================================
-- database_dynamic_schema.sql  (idempotent — safe to re-run)
-- Run this in your Supabase SQL Editor.
-- ================================================

-- ── 1. SYSTEM CONFIG TABLE ───────────────────
CREATE TABLE IF NOT EXISTS public.system_config (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults (skip if key already exists)
INSERT INTO public.system_config (key, value, description)
VALUES
  ('global_settings',
   '{"registration_enabled": true, "maintenance_mode": false, "base_margin_percentage": 5}',
   'Core platform toggles'),
  ('afa_settings',
   '{"normal_tier_price": 50, "premium_tier_price": 100}',
   'AFA Program Pricing')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_read_all"   ON public.system_config;
DROP POLICY IF EXISTS "config_admin_all"  ON public.system_config;

CREATE POLICY "config_read_all"
  ON public.system_config FOR SELECT
  USING (true);

CREATE POLICY "config_admin_all"
  ON public.system_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin')
    )
  );

-- ── 2. PRICING TABLE ─────────────────────────
-- Stores per-role price per GB used by buy-data & bulk-order pages.
CREATE TABLE IF NOT EXISTS public.pricing (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  role      TEXT    NOT NULL,
  product   TEXT    NOT NULL,
  price     NUMERIC(10,2) NOT NULL
);

-- Ensure unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_role_product_unique') THEN
    ALTER TABLE public.pricing ADD CONSTRAINT pricing_role_product_unique UNIQUE (role, product);
  END IF;
END $$;

-- Seed default pricing rows
INSERT INTO public.pricing (role, product, price)
VALUES
  ('client',       'data_per_gb', 5.00),
  ('vip_customer', 'data_per_gb', 4.50),
  ('elite_agent',  'data_per_gb', 4.00),
  ('super_agent',  'data_per_gb', 3.50),
  ('admin',        'data_per_gb', 3.00)
ON CONFLICT (role, product) DO NOTHING;

ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_read_all"  ON public.pricing;
DROP POLICY IF EXISTS "pricing_admin_all" ON public.pricing;

CREATE POLICY "pricing_read_all"
  ON public.pricing FOR SELECT
  USING (true);

CREATE POLICY "pricing_admin_all"
  ON public.pricing FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin')
    )
  );

-- ── 3. API KEYS TABLE ─────────────────────────
CREATE TABLE IF NOT EXISTS public.api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_name     TEXT        NOT NULL DEFAULT 'Default Key',
  api_key      TEXT        UNIQUE NOT NULL DEFAULT md5(gen_random_uuid()::text),
  status       TEXT        NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON public.api_keys(api_key);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apikeys_owner_all"  ON public.api_keys;
DROP POLICY IF EXISTS "apikeys_admin_read" ON public.api_keys;

CREATE POLICY "apikeys_owner_all"
  ON public.api_keys FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "apikeys_admin_read"
  ON public.api_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin')
    )
  );
