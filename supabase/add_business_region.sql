-- Run this script in the Supabase SQL Editor to add the missing fields for the settings page update.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS region TEXT;
