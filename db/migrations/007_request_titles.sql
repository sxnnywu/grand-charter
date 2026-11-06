ALTER TABLE leads ADD COLUMN title text
    CHECK (title IS NULL OR (char_length(title) BETWEEN 1 AND 80 AND title = btrim(title)));
