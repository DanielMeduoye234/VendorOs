-- ============================================================================
-- VendorOS Supabase / PostgreSQL Schema & Seed Data
-- Run this in your Supabase Project: SQL Editor -> New Query -> Run
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY DEFAULT ('vnd_' || substr(md5(random()::text), 1, 8)),
    name TEXT NOT NULL,
    contact_person TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    category TEXT DEFAULT 'General Supplier',
    tier TEXT DEFAULT 'Standard' CHECK (tier IN ('Strategic', 'Preferred', 'Standard', 'Under Review')),
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PROBATION', 'SUSPENDED')),
    payment_terms TEXT DEFAULT 'Net 30',
    reliability_score DOUBLE PRECISION DEFAULT 85.0,
    on_time_delivery_rate DOUBLE PRECISION DEFAULT 85.0,
    quality_score DOUBLE PRECISION DEFAULT 4.0,
    total_orders INTEGER DEFAULT 0,
    total_spend DOUBLE PRECISION DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Catalog Items (Parts & Multi-Supplier Pricing)
CREATE TABLE IF NOT EXISTS catalog_items (
    id TEXT PRIMARY KEY DEFAULT ('cat_' || substr(md5(random()::text), 1, 8)),
    vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    vendor_name TEXT DEFAULT '',
    sku TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    unit_price DOUBLE PRECISION NOT NULL,
    currency TEXT DEFAULT 'USD',
    min_order_qty INTEGER DEFAULT 1,
    lead_time_days INTEGER DEFAULT 7,
    in_stock BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for instant multi-vendor price comparison queries by SKU
CREATE INDEX IF NOT EXISTS idx_catalog_sku ON catalog_items(sku);

-- 3. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY DEFAULT ('po_' || substr(md5(random()::text), 1, 8)),
    po_number TEXT NOT NULL UNIQUE,
    vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    vendor_name TEXT DEFAULT '',
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expected_date TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),
    delivered_date TIMESTAMP WITH TIME ZONE,
    subtotal DOUBLE PRECISION DEFAULT 0.0,
    tax_rate DOUBLE PRECISION DEFAULT 0.08,
    total_amount DOUBLE PRECISION DEFAULT 0.0,
    status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    notes TEXT DEFAULT '',
    was_on_time BOOLEAN,
    quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5)
);

-- 4. PO Line Items
CREATE TABLE IF NOT EXISTS po_items (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    catalog_item_id TEXT DEFAULT '',
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    total_price DOUBLE PRECISION NOT NULL DEFAULT 0.0
);

-- Note: If you want sample mock data, run backend/seed.sql optionally.


-- 5. Company Settings Table (Single-Row Organization Configuration)
CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    company_name TEXT NOT NULL DEFAULT 'Nexus Aerospace & Robotics Ltd.',
    tax_id TEXT DEFAULT 'US-EIN-98432109',
    operating_currency TEXT DEFAULT 'USD',
    default_tax_rate DOUBLE PRECISION DEFAULT 0.08,
    shipping_address TEXT DEFAULT '450 Innovation Parkway, Dock B, Austin, TX 78701',
    billing_address TEXT DEFAULT '450 Innovation Parkway, Suite 100, Austin, TX 78701',
    probation_threshold DOUBLE PRECISION DEFAULT 75.0,
    high_value_approval_min DOUBLE PRECISION DEFAULT 10000.0,
    contact_email TEXT DEFAULT 'procurement@nexus-aerospace.com',
    contact_phone TEXT DEFAULT '+1 (512) 890-4321',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO company_settings (id, company_name, tax_id, operating_currency, default_tax_rate, shipping_address, billing_address, probation_threshold, high_value_approval_min, contact_email, contact_phone)
VALUES (1, 'Nexus Aerospace & Robotics Ltd.', 'US-EIN-98432109', 'USD', 0.08, '450 Innovation Parkway, Dock B, Austin, TX 78701', '450 Innovation Parkway, Suite 100, Austin, TX 78701', 75.0, 10000.0, 'procurement@nexus-aerospace.com', '+1 (512) 890-4321')
ON CONFLICT (id) DO NOTHING;


-- 6. Products Table (Canonical Master SKU Registry)
-- Stores the canonical product record independent of any single supplier.
-- Multiple suppliers can quote the same product via catalog_items.
CREATE TABLE IF NOT EXISTS products (
    id                TEXT PRIMARY KEY DEFAULT ('prd_' || substr(md5(random()::text), 1, 8)),
    name              TEXT NOT NULL,
    description       TEXT DEFAULT '',
    sku               TEXT NOT NULL UNIQUE,
    category          TEXT DEFAULT 'General',
    unit_of_measure   TEXT DEFAULT 'units',
    target_stock_level INTEGER DEFAULT 0,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- 7. Product Inventory Table (Per-Supplier Stock Tracking)
-- Tracks how many units each supplier currently has available for a given product.
CREATE TABLE IF NOT EXISTS product_inventory (
    id               BIGSERIAL PRIMARY KEY,
    product_id       TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    vendor_id        TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    reorder_point    INTEGER DEFAULT 0 CHECK (reorder_point >= 0),
    last_updated     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes            TEXT DEFAULT '',
    UNIQUE(product_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON product_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_vendor  ON product_inventory(vendor_id);

