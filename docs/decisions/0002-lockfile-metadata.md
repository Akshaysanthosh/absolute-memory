# Keep lockfile metadata for the selected libraries

The AI SDK pulls in an identity helper through its gateway dependency. The database ORM also declares an optional peer for a hosted database service. Neither service is configured or called by this app.

The hygiene test permits the exact package names and one registry URL in the lockfile. It still checks application code and direct dependencies for the removed integrations. The lockfile stays reproducible with a plain npm install.
