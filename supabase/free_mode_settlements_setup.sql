-- ================================================
-- free_mode_settlements_setup.sql
-- Tracks debt settlement records for Free Mode users
-- and provides admin approval/rejection functions.
-- ================================================

CREATE TABLE IF NOT EXISTS public.free_mode_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_paid NUMERIC(12,2) NOT NULL CHECK (amount_paid > 0),
  payment_method TEXT NOT NULL DEFAULT 'manual',
  reference TEXT,
  note TEXT,
  review_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by UUID REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fms_user_id ON public.free_mode_settlements(user_id);
CREATE INDEX IF NOT EXISTS idx_fms_status ON public.free_mode_settlements(status);
CREATE INDEX IF NOT EXISTS idx_fms_created_at ON public.free_mode_settlements(created_at DESC);

ALTER TABLE public.free_mode_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fms_admin_all" ON public.free_mode_settlements;
CREATE POLICY "fms_admin_all"
  ON public.free_mode_settlements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "fms_user_read_own" ON public.free_mode_settlements;
CREATE POLICY "fms_user_read_own"
  ON public.free_mode_settlements FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fms_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fms_touch_updated_at ON public.free_mode_settlements;
CREATE TRIGGER trg_fms_touch_updated_at
  BEFORE UPDATE ON public.free_mode_settlements
  FOR EACH ROW EXECUTE FUNCTION public.fms_touch_updated_at();

CREATE OR REPLACE FUNCTION public.admin_approve_free_mode_settlement(
  p_record_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.free_mode_settlements%ROWTYPE;
  v_balance NUMERIC(12,2);
  v_new_balance NUMERIC(12,2);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_record
  FROM public.free_mode_settlements
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement record not found: %', p_record_id;
  END IF;

  IF v_record.status <> 'pending' THEN
    RAISE EXCEPTION 'Record already reviewed: %', v_record.status;
  END IF;

  SELECT COALESCE(balance_owed, 0)
  INTO v_balance
  FROM public.users
  WHERE id = v_record.user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found for settlement record';
  END IF;

  v_new_balance := GREATEST(v_balance - v_record.amount_paid, 0);

  UPDATE public.users
  SET
    balance_owed = v_new_balance,
    is_free_mode = CASE WHEN v_new_balance <= 0 THEN FALSE ELSE COALESCE(is_free_mode, FALSE) END
  WHERE id = v_record.user_id;

  UPDATE public.free_mode_settlements
  SET
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = NOW(),
    review_note = COALESCE(p_admin_note, review_note)
  WHERE id = p_record_id;

  RETURN jsonb_build_object(
    'success', true,
    'record_id', p_record_id,
    'user_id', v_record.user_id,
    'amount_paid', v_record.amount_paid,
    'previous_balance_owed', v_balance,
    'new_balance_owed', v_new_balance,
    'free_mode_active', CASE WHEN v_new_balance > 0 THEN true ELSE false END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_free_mode_settlement(
  p_record_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.free_mode_settlements%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_record
  FROM public.free_mode_settlements
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement record not found: %', p_record_id;
  END IF;

  IF v_record.status <> 'pending' THEN
    RAISE EXCEPTION 'Record already reviewed: %', v_record.status;
  END IF;

  UPDATE public.free_mode_settlements
  SET
    status = 'rejected',
    approved_by = auth.uid(),
    approved_at = NOW(),
    review_note = COALESCE(p_admin_note, review_note)
  WHERE id = p_record_id;

  RETURN jsonb_build_object(
    'success', true,
    'record_id', p_record_id,
    'status', 'rejected'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_free_mode_settlement(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_free_mode_settlement(UUID, TEXT) TO authenticated;
