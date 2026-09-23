-- ============================================================================
-- VendorOS Optional Seed Data (Run ONLY if you want sample demo data)
-- ============================================================================

INSERT INTO vendors (id, name, contact_person, email, phone, category, tier, status, payment_terms, reliability_score, on_time_delivery_rate, quality_score, total_orders, total_spend, created_at)
VALUES 
('vnd_acme', 'Acme Precision Components', 'Sarah Jenkins', 's.jenkins@acmeprecision.com', '+1 (555) 234-8901', 'Precision Hardware & CNC', 'Strategic', 'ACTIVE', 'Net 30', 94.5, 96.0, 4.8, 18, 142500.00, NOW() - INTERVAL '180 days'),
('vnd_apex', 'Apex Micro-Semiconductors', 'David Chen', 'orders@apexmicro.io', '+1 (555) 876-1234', 'Electronics & Microcontrollers', 'Preferred', 'ACTIVE', 'Net 45', 88.0, 85.0, 4.7, 12, 89400.00, NOW() - INTERVAL '120 days'),
('vnd_global', 'Global Packaging Solutions', 'Marcus Sterling', 'supply@globalpack.net', '+1 (555) 432-9087', 'Packaging & Corrugated Materials', 'Standard', 'ACTIVE', 'Due on Receipt', 76.0, 72.0, 4.1, 7, 21600.00, NOW() - INTERVAL '90 days'),
('vnd_novatech', 'NovaTech Fasteners Corp', 'Elena Rostova', 'elena@novatechfasteners.com', '+1 (555) 789-3421', 'Precision Hardware & CNC', 'Preferred', 'ACTIVE', 'Net 30', 91.2, 92.5, 4.6, 10, 45800.00, NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog_items (id, vendor_id, vendor_name, sku, item_name, category, unit_price, currency, min_order_qty, lead_time_days, in_stock)
VALUES
('cat_001', 'vnd_acme', 'Acme Precision Components', 'BOLT-M4-TI', 'Grade 5 Titanium M4 Hex Bolt (100pk)', 'Fasteners', 42.50, 'USD', 10, 5, TRUE),
('cat_002', 'vnd_novatech', 'NovaTech Fasteners Corp', 'BOLT-M4-TI', 'Grade 5 Titanium M4 Hex Bolt (100pk)', 'Fasteners', 38.90, 'USD', 25, 8, TRUE),
('cat_003', 'vnd_apex', 'Apex Micro-Semiconductors', 'MCU-CM4-64K', 'ARM Cortex-M4 32-bit MCU 64LQFP', 'Semiconductors', 6.85, 'USD', 100, 14, TRUE),
('cat_004', 'vnd_global', 'Global Packaging Solutions', 'BOX-ESD-M', 'Conductive Fluted ESD Storage Box (Medium)', 'Packaging', 4.20, 'USD', 50, 3, TRUE),
('cat_005', 'vnd_acme', 'Acme Precision Components', 'BAR-AL6061-2M', 'Anodized Aluminum 6061 Profile 20x20mm (2m)', 'Raw Materials', 16.75, 'USD', 15, 6, TRUE),
('cat_006', 'vnd_novatech', 'NovaTech Fasteners Corp', 'BAR-AL6061-2M', 'Anodized Aluminum 6061 Profile 20x20mm (2m)', 'Raw Materials', 15.20, 'USD', 30, 10, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_orders (id, po_number, vendor_id, vendor_name, order_date, expected_date, delivered_date, subtotal, tax_rate, total_amount, status, notes, was_on_time, quality_rating)
VALUES
('po_101', 'PO-2026-001', 'vnd_acme', 'Acme Precision Components', NOW() - INTERVAL '14 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '5 days', 1520.00, 0.08, 1641.60, 'DELIVERED', 'Urgent prototype batch run for Q3 production line.', TRUE, 5),
('po_102', 'PO-2026-002', 'vnd_apex', 'Apex Micro-Semiconductors', NOW() - INTERVAL '7 days', NOW() + INTERVAL '7 days', NULL, 3425.00, 0.08, 3699.00, 'SHIPPED', 'Standard buffer stock replenishment. Air freight tracking provided.', NULL, NULL),
('po_103', 'PO-2026-003', 'vnd_global', 'Global Packaging Solutions', NOW() - INTERVAL '2 days', NOW() + INTERVAL '5 days', NULL, 840.00, 0.08, 907.20, 'CONFIRMED', 'Warehouse packaging restock.', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO po_items (order_id, catalog_item_id, sku, name, quantity, unit_price, total_price)
VALUES
('po_101', 'cat_001', 'BOLT-M4-TI', 'Grade 5 Titanium M4 Hex Bolt (100pk)', 20, 42.50, 850.00),
('po_101', 'cat_005', 'BAR-AL6061-2M', 'Anodized Aluminum 6061 Profile (2m)', 40, 16.75, 670.00),
('po_102', 'cat_003', 'MCU-CM4-64K', 'ARM Cortex-M4 32-bit MCU 64LQFP', 500, 6.85, 3425.00),
('po_103', 'cat_004', 'BOX-ESD-M', 'Conductive Fluted ESD Storage Box (Medium)', 200, 4.20, 840.00)
ON CONFLICT DO NOTHING;
