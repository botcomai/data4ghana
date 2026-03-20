-- Enable Row Level Security (in case it is off)
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing select policy just in case it exists to avoid conflicts
DROP POLICY IF EXISTS "st_sel_own" ON public.support_tickets;

-- Create policy to allow authenticated users to view their own ticket history
CREATE POLICY "st_sel_own"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);
