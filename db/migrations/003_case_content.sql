CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads (id),
    uploader_user_id uuid NOT NULL REFERENCES users (id),
    sharing_firm_id uuid REFERENCES firms (id),
    file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
    storage_key uuid NOT NULL UNIQUE,
    size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documents_lead_created_idx ON documents (lead_id, created_at DESC);

CREATE TABLE firm_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES cases (id),
    author_user_id uuid NOT NULL REFERENCES users (id),
    firm_id uuid NOT NULL REFERENCES firms (id),
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX firm_notes_case_created_idx ON firm_notes (case_id, created_at DESC);
