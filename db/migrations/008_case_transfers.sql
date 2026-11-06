CREATE TABLE case_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES cases (id),
    from_firm_id uuid NOT NULL REFERENCES firms (id),
    to_firm_id uuid NOT NULL REFERENCES firms (id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    offered_by uuid NOT NULL REFERENCES users (id),
    decided_by uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    CHECK (from_firm_id <> to_firm_id),
    CHECK ((status = 'pending') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX case_transfers_pending_case_idx ON case_transfers (case_id) WHERE status = 'pending';
CREATE INDEX case_transfers_case_created_idx ON case_transfers (case_id, created_at DESC, id DESC);
CREATE INDEX case_transfers_firm_status_idx ON case_transfers (to_firm_id, status, case_id);
