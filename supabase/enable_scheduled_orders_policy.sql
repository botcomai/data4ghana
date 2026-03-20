-- Enable Row Level Security (in case it is off)
ALTER TABLE public.scheduled_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing select policy just in case it exists to avoid conflicts
DROP POLICY IF EXISTS "sch_sel_own" ON public.scheduled_orders;

-- Create policy to allow authenticated users to view their own scheduled orders
CREATE POLICY "sch_sel_own"
  ON public.scheduled_orders FOR SELECT
  USING (auth.uid() = user_id);
