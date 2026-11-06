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
    ('Employment', 'Ontario', '10000000-0000-4000-8000-000000000001'),
    ('Housing', 'Ontario', '10000000-0000-4000-8000-000000000002')
ON CONFLICT (category, region) DO NOTHING;

-- Maya demonstrates returning to existing work. Jordan starts without requests.
-- Fixed IDs make reruns safe without resetting later demo activity.
INSERT INTO leads (id, plaintiff_id, name, email, category, region, description, status, firm_id, created_at) VALUES
    ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
     'Maya Patel', 'maya@example.com', 'Employment', 'Ontario',
     'I was dismissed from my job and need help understanding my options.',
     'awaiting_firm_review', '10000000-0000-4000-8000-000000000001', now() - interval '2 days'),
    ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
     'Maya Patel', 'maya@example.com', 'Housing', 'Ontario',
     'My landlord has not returned my deposit. I would like help understanding what I can do next.',
     'accepted', '10000000-0000-4000-8000-000000000002', now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cases (id, lead_id, status, created_at)
SELECT '40000000-0000-4000-8000-000000000001', id, 'in_progress', now() - interval '71 hours'
FROM leads WHERE id = '30000000-0000-4000-8000-000000000002' AND status = 'accepted'
ON CONFLICT DO NOTHING;

INSERT INTO audit_events (id, lead_id, event_type, actor_user_id, before_values, after_values, created_at) VALUES
    ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
     'lead_routed', NULL, NULL,
     '{"firmId":"10000000-0000-4000-8000-000000000001","status":"awaiting_firm_review"}', now() - interval '2 days'),
    ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
     'lead_routed', NULL, NULL,
     '{"firmId":"10000000-0000-4000-8000-000000000002","status":"awaiting_firm_review"}', now() - interval '3 days'),
    ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002',
     'lead_accepted', '20000000-0000-4000-8000-000000000005', '{"status":"awaiting_firm_review"}',
     '{"status":"accepted","caseId":"40000000-0000-4000-8000-000000000001","caseStatus":"open"}', now() - interval '71 hours'),
    ('50000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002',
     'case_status_changed', '20000000-0000-4000-8000-000000000005',
     '{"caseId":"40000000-0000-4000-8000-000000000001","caseStatus":"open"}',
     '{"caseId":"40000000-0000-4000-8000-000000000001","caseStatus":"in_progress"}', now() - interval '60 hours')
ON CONFLICT (id) DO NOTHING;
