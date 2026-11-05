CREATE INDEX documents_lead_page_idx ON documents (lead_id, created_at DESC, id DESC);
CREATE INDEX firm_notes_case_page_idx ON firm_notes (case_id, created_at DESC, id DESC);
CREATE INDEX firm_notes_firm_page_idx ON firm_notes (case_id, firm_id, created_at DESC, id DESC);
