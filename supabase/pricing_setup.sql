-- ==========================================
-- ROLE-BASED PRICING TABLE
-- Stores per-GB data prices and AFA prices
-- for each user role
-- ==========================================

CREATE TABLE IF NOT EXISTS pricing (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    role TEXT NOT NULL,
    product TEXT NOT NULL,           -- 'data_per_gb', 'afa_premium', 'afa_normal'
    price NUMERIC(10,2) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(role, product)
);

-- ==========================================
-- DEFAULT PRICING MATRIX
-- ==========================================

-- DATA PER GB PRICING (price per 1GB)
INSERT INTO pricing (role, product, price) VALUES
    ('client',       'data_per_gb',  5.00),
    ('vip_customer', 'data_per_gb',  4.50),
    ('elite_agent',  'data_per_gb',  4.00),
    ('super_agent',  'data_per_gb',  3.50),
    ('admin',        'data_per_gb',  3.00)
ON CONFLICT (role, product) DO NOTHING;

-- AFA PREMIUM PRICING
INSERT INTO pricing (role, product, price) VALUES
    ('client',       'afa_premium',  30.00),
    ('vip_customer', 'afa_premium',  28.00),
    ('elite_agent',  'afa_premium',  25.00),
    ('super_agent',  'afa_premium',  22.00),
    ('admin',        'afa_premium',  20.00)
ON CONFLICT (role, product) DO NOTHING;

-- AFA NORMAL PRICING
INSERT INTO pricing (role, product, price) VALUES
    ('client',       'afa_normal',   25.00),
    ('vip_customer', 'afa_normal',   23.00),
    ('elite_agent',  'afa_normal',   20.00),
    ('super_agent',  'afa_normal',   18.00),
    ('admin',        'afa_normal',   15.00)
ON CONFLICT (role, product) DO NOTHING;

-- ==========================================
-- RLS POLICIES
-- ==========================================
ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read pricing
CREATE POLICY "Authenticated users can read pricing"
    ON pricing FOR SELECT
    USING (auth.role() = 'authenticated');

-- Only admins can manage pricing
CREATE POLICY "Admins can manage pricing"
    ON pricing FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
