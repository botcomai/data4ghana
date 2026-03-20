-- ================================================
-- fix_scheduled_orders_relationship.sql
-- Fixes the join relationship between scheduled_orders and public.users
-- ================================================

-- 1. Drop the old foreign key (referencing auth.users)
ALTER TABLE public.scheduled_orders 
DROP CONSTRAINT IF EXISTS scheduled_orders_user_id_fkey;

-- 2. Add the correct foreign key (referencing public.users)
ALTER TABLE public.scheduled_orders 
ADD CONSTRAINT scheduled_orders_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
