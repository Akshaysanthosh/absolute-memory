# Create the first account in one database transaction

Instance setup locks the singleton settings row, inserts a Better Auth credential account, creates the welcome note and records the owner. Concurrent setup requests therefore select one owner. The invite path uses the same transaction and consumes an expiring, hashed token alongside account creation.

The existing welcome screens remain a per-account flow. An owner cannot delete the instance owner account through Settings, since that could reopen first-run registration. The reset command asks Better Auth for a single-use link. It sends no mail unless SMTP is configured and a user requests email recovery.
