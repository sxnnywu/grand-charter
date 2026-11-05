CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX leads_name_search_idx ON leads USING gin (name gin_trgm_ops);
CREATE INDEX leads_created_page_idx ON leads (created_at DESC, id DESC);
CREATE INDEX leads_status_page_idx ON leads (status, created_at DESC, id DESC);
CREATE INDEX leads_firm_page_idx ON leads (firm_id, created_at DESC, id DESC);
