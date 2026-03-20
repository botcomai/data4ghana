-- ==========================================
-- USER ROLES SYSTEM SETUP
-- Adds role constraints and defaults to the
-- users table for 5 distinct role types
-- ==========================================

-- 1. Set default role for the column
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'client';

-- 2. Update any existing users without a role to 'client'
UPDATE users SET role = 'client' WHERE role IS NULL OR role = '';

-- 3. Add CHECK constraint for valid roles
-- (Drop if exists first to avoid conflicts)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'client', 'super_agent', 'elite_agent', 'vip_customer'));
