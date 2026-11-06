CREATE TABLE firms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL,
    role text NOT NULL CHECK (role IN ('plaintiff', 'attorney', 'paralegal', 'admin')),
    firm_id uuid REFERENCES firms (id),
    is_demo boolean NOT NULL DEFAULT false,
    CHECK ((role IN ('attorney', 'paralegal')) = (firm_id IS NOT NULL))
);

CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE routing_rules (
    category text NOT NULL,
    region text NOT NULL,
    firm_id uuid NOT NULL REFERENCES firms (id),
    PRIMARY KEY (category, region)
);

CREATE TABLE leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plaintiff_id uuid NOT NULL REFERENCES users (id),
    name text NOT NULL,
    email text NOT NULL,
    category text NOT NULL,
    region text NOT NULL,
    description text NOT NULL,
    status text NOT NULL CHECK (status IN (
        'pending_assignment', 'awaiting_firm_review', 'accepted', 'declined', 'closed'
    )),
    firm_id uuid REFERENCES firms (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status IN ('pending_assignment', 'closed')) = (firm_id IS NULL))
);

CREATE INDEX leads_plaintiff_created_idx ON leads (plaintiff_id, created_at DESC);
CREATE INDEX leads_firm_status_created_idx ON leads (firm_id, status, created_at DESC);

CREATE TABLE cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL UNIQUE REFERENCES leads (id),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads (id),
    event_type text NOT NULL,
    actor_user_id uuid REFERENCES users (id),
    before_values jsonb,
    after_values jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_lead_created_idx ON audit_events (lead_id, created_at DESC);
