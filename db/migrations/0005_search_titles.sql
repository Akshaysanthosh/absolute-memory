CREATE INDEX item_title_search ON item USING gin (to_tsvector('english', title));
