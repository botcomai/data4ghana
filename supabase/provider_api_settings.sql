-- ============================================================
-- MIGRATION: Provider API settings
-- Seeds all Cleanheart Solutions provider settings into
-- app_settings so Edge Functions can read them at runtime.
-- Run this in the Supabase SQL Editor.
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES
  -- API key (admin saves the real value via the gateway UI)
  ('datarjust_api_key',               '',                                         'X-API-Key value for the Cleanheart Solutions provider'),
  ('datarjust_api_enabled',           'false',                                    'Master toggle for the external VTU API gateway'),
  ('api_auto_order',                  'false',                                    'Automatically fulfil data orders via API when placed'),

  -- Official provider routing (used by Edge Functions)
  ('provider_api_base_url',           'https://cleanheartsolutions.com/api',      'Base URL for the VTU provider API'),
  ('provider_api_auth_header',        'X-API-Key',                                'Auth header name for provider API calls'),
  ('provider_api_purchase_path',      '/purchase',                                'Provider endpoint: POST data bundle purchase'),
  ('provider_api_balance_path',       '/balance',                                 'Provider endpoint: GET wallet balance'),
  ('provider_api_order_status_path',  '/orders',                                  'Provider endpoint: GET /orders?reference=XXX'),

  -- Manual MoMo settings (unchanged)
  ('manual_transfer_enabled',         'true',                                     'Show manual MoMo payment option to users'),
  ('manual_momo_number',              '0000000000',                               'MoMo number shown to users for manual payments'),
  ('manual_momo_name',                'System Admin',                             'MoMo account name shown to users')

ON CONFLICT (key) DO UPDATE
  SET description = EXCLUDED.description;
  -- NOTE: Values are NOT overwritten on conflict so existing configured values are preserved.

-- Verify settings were seeded
SELECT key, value, description
FROM public.app_settings
WHERE key LIKE 'datarjust_%'
   OR key LIKE 'provider_api_%'
   OR key LIKE 'manual_%'
   OR key = 'api_auto_order'
ORDER BY key;
