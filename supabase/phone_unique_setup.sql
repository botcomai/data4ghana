-- ==========================================
-- PHONE NUMBER UNIQUENESS CONSTRAINT
-- Prevents duplicate phone registrations
-- ==========================================

-- Add a unique constraint on the phone column
-- (Only if it doesn't already exist)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_unique;
ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);
