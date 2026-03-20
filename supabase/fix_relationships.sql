-- ================================================
-- fix_relationships.sql
-- Run this in your Supabase SQL Editor to resolve
-- relationship/join errors between users and other tables.
-- ================================================

-- 1. Fix public.orders relationship
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS orders_user_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

-- 2. Fix public.transactions relationship
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

-- 3. Fix public.support_tickets relationship
ALTER TABLE public.support_tickets 
  DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

-- 4. Notify PostgREST to reload the schema cache
-- (This happens automatically in Supabase usually, but running a DDL helps)
NOTIFY pgrst, 'reload schema';
