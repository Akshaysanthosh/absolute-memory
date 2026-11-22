CREATE TABLE imported_item_origin (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 source_id uuid NOT NULL,
 item_id uuid NOT NULL,
 PRIMARY KEY(user_id,source_id),
 FOREIGN KEY(item_id,user_id) REFERENCES item(id,user_id) ON DELETE CASCADE
);
