-- performance_optimization.sql
-- Optimizes the admin dashboard by adding indexes and server-side aggregation functions.
-- Run this in the Supabase SQL Editor.

-- 1. Accelerate sorting and filtering
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);

-- 2. Ensure profit tracking column exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS wholesale_cost NUMERIC(10,2);

-- 3. Core Dashboard Stats RPC
-- Returns counts and today's revenue in a single request
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
    today_start TIMESTAMPTZ := CURRENT_DATE;
    user_count INT;
    today_revenue NUMERIC;
    today_orders INT;
    status_counts JSONB;
BEGIN
    -- Authorization check
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Stats gathering
    SELECT count(*) INTO user_count FROM users WHERE role != 'admin';
    
    SELECT coalesce(sum(amount), 0) INTO today_revenue 
    FROM transactions 
    WHERE status = 'completed' AND created_at >= today_start;

    SELECT count(*) INTO today_orders 
    FROM orders 
    WHERE created_at >= today_start;

    SELECT jsonb_object_agg(status_key, count) INTO status_counts
    FROM (
        SELECT 
            CASE 
                WHEN status = 'false' OR status = 'pending' THEN 'pending'
                WHEN status = 'true' OR status = 'completed' THEN 'completed'
                ELSE lower(status)
            END as status_key,
            count(*) as count
        FROM orders
        GROUP BY 1
    ) s;

    result := jsonb_build_object(
        'user_count', user_count,
        'today_revenue', today_revenue,
        'today_orders', today_orders,
        'status_counts', status_counts
    );

    RETURN result;
END;
$$;

-- 4. Financial Metrics RPC
-- Calculates totals on the server to avoid downloading thousands of rows
CREATE OR REPLACE FUNCTION public.get_financial_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
    total_liability NUMERIC;
    total_revenue NUMERIC;
    total_profit NUMERIC;
BEGIN
     -- Authorization check
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Total Liability (Sum of all user balances, excluding admins)
    SELECT coalesce(sum(wallet_balance), 0) INTO total_liability FROM users WHERE role != 'admin';

    -- Total Revenue (Sum of all successful orders)
    SELECT coalesce(sum(amount), 0) INTO total_revenue 
    FROM orders 
    WHERE status IN ('true', 'completed');

    -- Total Profit (Estimated: Revenue - Wholesale Cost)
    -- If wholesale_cost is missing, we assume a ~5% margin for historical data
    SELECT coalesce(sum(amount - coalesce(wholesale_cost, amount * 0.95)), 0) INTO total_profit 
    FROM orders 
    WHERE status IN ('true', 'completed');

    result := jsonb_build_object(
        'total_revenue', total_revenue,
        'total_profit', total_profit,
        'total_liability', total_liability
    );

    RETURN result;
END;
$$;
