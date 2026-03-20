-- ==========================================
-- PAYMENT GATEWAY SETTINGS
-- Stores manual transfer gateway toggles
-- in the existing app_settings table
-- ==========================================

-- Manual Transfer Gateway Toggle
INSERT INTO app_settings (key, value, description)
VALUES ('manual_transfer_enabled', 'true', 'When true, Manual Transfer payment option is available to users')
ON CONFLICT (key) DO NOTHING;
