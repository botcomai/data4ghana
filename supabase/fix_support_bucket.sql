-- ================================================
-- fix_support_bucket.sql
-- Run this in the Supabase SQL Editor to fix the
-- "Bucket not found" error for support tickets.
-- ================================================

-- 1. Ensure the 'tickets' bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets', 'tickets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Setup RLS for the 'tickets' bucket
-- This DO block handles different Supabase versions (owner_id vs owner)
DO $$
DECLARE
  has_owner_id BOOLEAN;
BEGIN
  -- Detect column name in storage.objects
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'storage'
    AND    table_name   = 'objects'
    AND    column_name  = 'owner_id'
  ) INTO has_owner_id;

  -- Clear existing policies to avoid conflicts
  DROP POLICY IF EXISTS "tk_read_policy" ON storage.objects;
  DROP POLICY IF EXISTS "tk_insert_policy" ON storage.objects;
  DROP POLICY IF EXISTS "tk_select_policy" ON storage.objects;
  DROP POLICY IF EXISTS "tk_delete_policy" ON storage.objects;
  DROP POLICY IF EXISTS "tk_read" ON storage.objects;
  DROP POLICY IF EXISTS "tk_insert" ON storage.objects;
  DROP POLICY IF EXISTS "tk_delete" ON storage.objects;

  IF has_owner_id THEN
    -- Modern Supabase (owner_id)
    EXECUTE 'CREATE POLICY "tk_select_policy" ON storage.objects FOR SELECT USING (bucket_id = ''tickets'');';
    EXECUTE 'CREATE POLICY "tk_insert_policy" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''tickets'' AND auth.role() = ''authenticated'');';
  ELSE
    -- Legacy Supabase (owner)
    EXECUTE 'CREATE POLICY "tk_select_policy" ON storage.objects FOR SELECT USING (bucket_id = ''tickets'');';
    EXECUTE 'CREATE POLICY "tk_insert_policy" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''tickets'' AND auth.role() = ''authenticated'');';
  END IF;

  -- Optional: Allow users to delete their own uploads if we want
  -- But for support tickets, usually they stay there for audit.
  
END $$;
