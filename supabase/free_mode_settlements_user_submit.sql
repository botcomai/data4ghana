-- Allow end users to submit debt settlement records for their own account
-- and keep access to only their own records.

ALTER TABLE public.free_mode_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fms_user_insert_own" ON public.free_mode_settlements;
CREATE POLICY "fms_user_insert_own"
  ON public.free_mode_settlements FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND submitted_by = auth.uid()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "fms_user_read_own" ON public.free_mode_settlements;
CREATE POLICY "fms_user_read_own"
  ON public.free_mode_settlements FOR SELECT
  USING (user_id = auth.uid());
