-- ================================================
-- fix_afa_relationship.sql
-- Run this to fix the relationship between registrations and users
-- ================================================

DO $$ 
BEGIN
    -- Drop the old constraint if it exists (it targets auth.users)
    -- We need to check the exact constraint name if possible, 
    -- but usually it is afa_registrations_user_id_fkey
    ALTER TABLE public.afa_registrations 
    DROP CONSTRAINT IF EXISTS afa_registrations_user_id_fkey;

    -- Add the new constraint targeting public.users
    ALTER TABLE public.afa_registrations 
    ADD CONSTRAINT afa_registrations_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.users(id) 
    ON DELETE CASCADE;

END $$;
