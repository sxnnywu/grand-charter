INSERT INTO firms (id, name) VALUES
    ('10000000-0000-4000-8000-000000000001', 'Northline Legal'),
    ('10000000-0000-4000-8000-000000000002', 'Harbour Law')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, email, role, firm_id, is_demo) VALUES
    ('20000000-0000-4000-8000-000000000001', 'Maya Patel', 'maya@example.com', 'plaintiff', NULL, true),
    ('20000000-0000-4000-8000-000000000002', 'Jordan Lee', 'jordan@example.com', 'plaintiff', NULL, true),
    ('20000000-0000-4000-8000-000000000003', 'Alex Chen', 'alex@example.com', 'attorney', '10000000-0000-4000-8000-000000000001', true),
    ('20000000-0000-4000-8000-000000000004', 'Priya Shah', 'priya@example.com', 'paralegal', '10000000-0000-4000-8000-000000000001', true),
    ('20000000-0000-4000-8000-000000000005', 'Sofia Martin', 'sofia@example.com', 'attorney', '10000000-0000-4000-8000-000000000002', true),
    ('20000000-0000-4000-8000-000000000006', 'Morgan Ellis', 'morgan@example.com', 'admin', NULL, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO routing_rules (category, region, firm_id) VALUES
    ('Employment', 'Ontario', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (category, region) DO NOTHING;
