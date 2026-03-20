-- ================================================
-- legacy_order_refund_rpc.sql
-- Atomic admin refund for legacy orders.
-- Run this in Supabase SQL Editor.
-- ================================================

CREATE OR REPLACE FUNCTION public.admin_refund_legacy_order(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order            public.orders%ROWTYPE;
  v_balance_before   NUMERIC;
  v_balance_after    NUMERIC;
  v_reference        TEXT;
  v_txn_id           UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'skipped', true,
      'reason', 'order_has_no_user_id',
      'order_id', p_order_id
    );
  END IF;

  IF COALESCE(LOWER(v_order.status), '') = 'refunded' THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'already_refunded',
      'order_id', p_order_id
    );
  END IF;

  IF COALESCE(v_order.amount, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'skipped', true,
      'reason', 'invalid_amount',
      'order_id', p_order_id
    );
  END IF;

  v_reference := 'LEGACY-REFUND:' || v_order.id::TEXT;

  -- Idempotency guard.
  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE reference = v_reference
  ) THEN
    UPDATE public.orders
    SET status = 'refunded'
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'duplicate_reference',
      'order_id', p_order_id
    );
  END IF;

  SELECT wallet_balance
  INTO v_balance_before
  FROM public.users
  WHERE id = v_order.user_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'User wallet not found for order: %', p_order_id;
  END IF;

  v_balance_after := ROUND((v_balance_before + v_order.amount)::NUMERIC, 2);

  UPDATE public.users
  SET wallet_balance = v_balance_after
  WHERE id = v_order.user_id;

  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    reference,
    status
  )
  VALUES (
    v_order.user_id,
    'Legacy Order Refund (Admin)',
    v_order.amount,
    v_balance_before,
    v_balance_after,
    v_reference,
    'Refunded'
  )
  RETURNING id INTO v_txn_id;

  UPDATE public.orders
  SET status = 'refunded'
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'user_id', v_order.user_id,
    'amount', v_order.amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'transaction_id', v_txn_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_refund_legacy_order(UUID) TO authenticated;
