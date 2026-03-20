-- ================================================
-- database_users_support.sql  (v3 — fully safe)
-- Paste this entire script into the Supabase SQL
-- Editor and click RUN.
-- ================================================

-- ══════════════════════════════════════════════
-- PART 1 — USERS TABLE EXTENSIONS
-- ══════════════════════════════════════════════

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS merchant_id  TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url   TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name   TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name    TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role         TEXT NOT NULL DEFAULT 'client';

-- Backfill merchant_id for any existing rows that don't have one
UPDATE public.users
SET    merchant_id = 'D4G-' || upper(substr(md5(id::text), 1, 6))
WHERE  merchant_id IS NULL OR merchant_id LIKE 'MERCH-%';

-- Set a default so every new INSERT auto-generates one
ALTER TABLE public.users
  ALTER COLUMN merchant_id
  SET DEFAULT ('D4G-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)));

-- Unique constraint (only added once)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname    = 'users_merchant_id_key'
    AND    conrelid   = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_merchant_id_key UNIQUE (merchant_id);
  END IF;
END $$;

-- ══════════════════════════════════════════════
-- PART 2 — SUPPORT TICKETS TABLE
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone          TEXT        NOT NULL,
  issue          TEXT        NOT NULL,
  screenshot_url TEXT,
  status         TEXT        NOT NULL DEFAULT 'checking',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_st_user   ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_st_status ON public.support_tickets(status);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Drop + re-create every policy so re-runs never fail
DROP POLICY IF EXISTS "st_sel_own"   ON public.support_tickets;
DROP POLICY IF EXISTS "st_ins_own"   ON public.support_tickets;
DROP POLICY IF EXISTS "st_admin_all" ON public.support_tickets;

CREATE POLICY "st_sel_own"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "st_ins_own"
  ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "st_admin_all"
  ON public.support_tickets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND   role = 'admin'
    )
  );

-- ══════════════════════════════════════════════
-- PART 3 — STORAGE BUCKETS
-- ══════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets', 'tickets', true)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════
-- PART 4 — STORAGE RLS
-- Supabase changed `owner` (TEXT) → `owner_id` (UUID) in 2024.
-- We use a DO block to detect which column exists and apply
-- the correct policy automatically.
-- ══════════════════════════════════════════════

DO $$
DECLARE
  has_owner_id BOOLEAN;
BEGIN
  -- Detect whether owner_id (new) or owner (old) exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'storage'
    AND    table_name   = 'objects'
    AND    column_name  = 'owner_id'
  ) INTO has_owner_id;

  -- ── Drop old policies ──
  DROP POLICY IF EXISTS "av_read"   ON storage.objects;
  DROP POLICY IF EXISTS "av_insert" ON storage.objects;
  DROP POLICY IF EXISTS "av_update" ON storage.objects;
  DROP POLICY IF EXISTS "av_delete" ON storage.objects;
  DROP POLICY IF EXISTS "tk_read"   ON storage.objects;
  DROP POLICY IF EXISTS "tk_insert" ON storage.objects;
  DROP POLICY IF EXISTS "tk_delete" ON storage.objects;

  -- ── Avatars ──
  IF has_owner_id THEN
    -- Modern Supabase (owner_id might be UUID or TEXT depending on exact minor version)
    EXECUTE $p$ CREATE POLICY "av_read"   ON storage.objects FOR SELECT USING (bucket_id = 'avatars'); $p$;
    EXECUTE $p$ CREATE POLICY "av_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND owner_id::text = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "av_update" ON storage.objects FOR UPDATE USING  (bucket_id = 'avatars' AND owner_id::text = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "av_delete" ON storage.objects FOR DELETE USING  (bucket_id = 'avatars' AND owner_id::text = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "tk_read"   ON storage.objects FOR SELECT USING  (bucket_id = 'tickets' AND auth.role() = 'authenticated'); $p$;
    EXECUTE $p$ CREATE POLICY "tk_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'tickets' AND owner_id::text = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "tk_delete" ON storage.objects FOR DELETE USING  (bucket_id = 'tickets' AND owner_id::text = auth.uid()::text); $p$;
  ELSE
    -- Legacy Supabase (owner is TEXT)
    EXECUTE $p$ CREATE POLICY "av_read"   ON storage.objects FOR SELECT USING (bucket_id = 'avatars'); $p$;
    EXECUTE $p$ CREATE POLICY "av_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "av_update" ON storage.objects FOR UPDATE USING  (bucket_id = 'avatars' AND owner = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "av_delete" ON storage.objects FOR DELETE USING  (bucket_id = 'avatars' AND owner = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "tk_read"   ON storage.objects FOR SELECT USING  (bucket_id = 'tickets' AND auth.role() = 'authenticated'); $p$;
    EXECUTE $p$ CREATE POLICY "tk_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'tickets' AND owner = auth.uid()::text); $p$;
    EXECUTE $p$ CREATE POLICY "tk_delete" ON storage.objects FOR DELETE USING  (bucket_id = 'tickets' AND owner = auth.uid()::text); $p$;
  END IF;

END $$;
