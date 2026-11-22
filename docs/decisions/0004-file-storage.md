# Store files outside the database

Documents and cached thumbnails live under the configured storage root or bucket. The database holds the owning account, file metadata, content digest and object key. Object keys include the account hash, item ID, content digest and an upload ID so overlapping attempts never overwrite one another.

The database queues a temporary object for cleanup before upload. The transaction that attaches the verified metadata removes the cleanup entry. An interrupted upload or a lost import lease leaves the entry available to the worker, which checks for live references before deleting the object. Deleting or replacing a file also queues its former storage key.
