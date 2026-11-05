CREATE TABLE plaintiff_notices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plaintiff_notices_lead_created_idx
    ON plaintiff_notices (lead_id, created_at DESC, id DESC);
