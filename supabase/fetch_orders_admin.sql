-- ================================================
-- fetch_orders_admin.sql
-- Provides a clean way for admins to fetch all orders
-- with associated user details.
-- ================================================

-- 1. Create a secure view for admins
-- This combines order data with user information for a complete picture
CREATE OR REPLACE VIEW public.admin_orders_view AS
SELECT 
    o.id AS order_id,
    o.created_at,
    o.status,
    o.phone AS recipient_phone,
    o.network,
    o.plan AS bundle_plan,
    o.amount,
    o.api_reference,
    u.id AS user_id,
    u.email AS user_email,
    u.first_name || ' ' || u.last_name AS user_full_name,
    u.business_name,
    u.merchant_id AS client_code
FROM 
    public.orders o
JOIN 
    public.users u ON o.user_id = u.id;

-- 2. Ensure RLS is enforced on the view (Supabase specific)
-- Views in Supabase inherit RLS from underlying tables, 
-- but we can also add helper functions for common admin queries.

-- 3. Function to get orders with filters (Helper for direct SQL usage)
-- Usage: SELECT * FROM public.get_admin_orders_filtered('Completed', '2024-01-01');
CREATE OR REPLACE FUNCTION public.get_admin_orders_filtered(
    p_status TEXT DEFAULT NULL,
    p_from_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS SETOF public.admin_orders_view
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT *
    FROM public.admin_orders_view
    WHERE 
        (p_status IS NULL OR status = p_status) AND
        (p_from_date IS NULL OR created_at >= p_from_date) AND
        (p_to_date IS NULL OR created_at <= p_to_date)
    ORDER BY created_at DESC;
$$;
