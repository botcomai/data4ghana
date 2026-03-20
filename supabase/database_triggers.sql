-- ================================================
-- database_triggers.sql  (idempotent — safe to re-run)
-- Run this in your Supabase SQL Editor.
-- Uses pg_net (built into Supabase) to fire HTTP
-- calls to your Edge Functions on DB mutations.
-- ================================================

-- ── Enable pg_net extension ──────────────────
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Helper: fire the send-sms Edge Function ──
--    Uses pg_net (net.http_post) — available built-in on all Supabase projects
CREATE OR REPLACE FUNCTION _fire_sms(phone TEXT, message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://wynmejzsybkxhqvazjzu.supabase.co/functions/v1/send-sms',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bm1lanpzeWJreGhxdmF6anp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzU4MzAsImV4cCI6MjA4OTE1MTgzMH0.f9MFrnPZ4ODzJOz71zuWtuCThWO5UUyEv1FkWDEzRiU"}'::jsonb,
    body    := jsonb_build_object('to', phone, 'msg', message)
  );
EXCEPTION WHEN OTHERS THEN
  -- Don't let SMS failure break the DB transaction
  RAISE WARNING 'SMS dispatch failed for %: %', phone, SQLERRM;
END;
$$;

-- ── TRIGGER 1: Order status → Processed / Completed ────
CREATE OR REPLACE FUNCTION trigger_sms_on_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  msg TEXT;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('processed', 'completed') THEN
    msg := 'Hi! Your ' || NEW.plan || ' ' || NEW.network ||
           ' data bundle for ' || NEW.phone ||
           ' has been delivered successfully. Thank you for using Data4Ghana!';
    PERFORM _fire_sms(NEW.phone, msg);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_status_change ON public.orders;
CREATE TRIGGER on_order_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sms_on_order_update();

-- ── TRIGGER 2: Support ticket status change ─────────────
CREATE OR REPLACE FUNCTION trigger_sms_on_ticket_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  msg TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    msg := 'Data4Ghana Support Update: Your ticket status is now ' ||
           upper(NEW.status) || '. Log in to your dashboard for full details.';
    PERFORM _fire_sms(NEW.phone, msg);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_ticket_status_change ON public.support_tickets;
CREATE TRIGGER on_ticket_status_change
  AFTER UPDATE OF status ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sms_on_ticket_update();

-- ── TRIGGER 3: New user signup → auto-generate merchant_id ─
CREATE OR REPLACE FUNCTION set_default_merchant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.merchant_id IS NULL OR NEW.merchant_id = '' THEN
    NEW.merchant_id := 'D4G-' || upper(substr(md5(NEW.id::text), 1, 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_insert_set_merchant ON public.users;
CREATE TRIGGER on_user_insert_set_merchant
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION set_default_merchant_id();
