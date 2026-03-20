-- Promote data4ghana1@gmail.com to Admin
-- Run this in the Supabase SQL Editor

UPDATE public.users 
SET role = 'admin' 
WHERE email = 'data4ghana1@gmail.com';

-- Verify the change
SELECT id, email, role 
FROM public.users 
WHERE email = 'data4ghana1@gmail.com';
