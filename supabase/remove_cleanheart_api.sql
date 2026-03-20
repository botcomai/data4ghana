-- SQL Script to completely remove Cleanheart API Integrations
-- Run this in the Supabase SQL Editor if you wish to clean up upstream API configuration tables

-- Drop the settings table used for tracking apiAuto values if it exists
DROP TABLE IF EXISTS public.app_settings CASCADE;

-- Drop the API logs table if it exists
DROP TABLE IF EXISTS public.api_logs CASCADE;

-- Note: The Edge Functions themselves have been deleted from your local repository.
-- Next time you deploy to Supabase, those Edge Functions will not be included.
-- To manually delete them from the Supabase dashboard:
-- Go to Edge Functions -> Delete 'check-api-balance', 'place-data-order', 'test-api-connection', 'check-order-status'
