CREATE TABLE idempotency_requests (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    operation text NOT NULL,
    key uuid NOT NULL,
    request_hash text NOT NULL,
    response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, operation, key)
);
