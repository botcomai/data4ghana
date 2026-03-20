-- ================================================
-- afa_registrations_setup.sql  (idempotent)
-- Creates the missing registrations table and RLS
-- ================================================

CREATE TABLE IF NOT EXISTS public.afa_registrations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  phone          TEXT        NOT NULL,
  id_type        TEXT        NOT NULL,
  id_number      TEXT        NOT NULL,
  dob            DATE,
  id_front_url   TEXT,
  id_back_url    TEXT,
  tier           TEXT        NOT NULL CHECK (tier IN ('normal', 'premium')),
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'pending_verification')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.afa_registrations ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "afa_select_own" ON public.afa_registrations;
DROP POLICY IF EXISTS "afa_insert_own" ON public.afa_registrations;
DROP POLICY IF EXISTS "afa_admin_all"  ON public.afa_registrations;

-- Users can see their own registrations
CREATE POLICY "afa_select_own"
  ON public.afa_registrations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can submit their own registrations
CREATE POLICY "afa_insert_own"
  ON public.afa_registrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage everything
CREATE POLICY "afa_admin_all"
  ON public.afa_registrations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_afa_user_id ON public.afa_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_afa_status ON public.afa_registrations(status);
