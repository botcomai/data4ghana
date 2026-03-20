-- Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'danger')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Everyone can read active notifications
CREATE POLICY "Enable read access for all users" ON public.notifications
    FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- 2. Only admin can manage notifications (assuming admin check logic exists or is handled via role)
-- If there's an existing 'admin' role check in other SQLs, we should match it.
-- Based on previous sessions, 'admin' role is stored in public.users.
CREATE POLICY "Admins can manage notifications" ON public.notifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_active ON public.notifications(is_active, expires_at);

-- Seed Data
INSERT INTO public.notifications (content, type) VALUES 
('Welcome to the Data4Ghana Technologies dashboard! Enjoy our super-fast services.', 'success'),
('Notice: Scheduled data maintenance on Sunday 2 AM - 4 AM. All services remains active but might have slight delay.', 'warning'),
('Big Promo: Get 5GB bonus data on referrals this month. Terms apply.', 'info');
