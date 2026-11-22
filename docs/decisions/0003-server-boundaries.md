# Keep HTTP, application logic, and SQL in separate layers

Next.js route files authenticate requests, validate incoming data, call services, and return HTTP responses. Shared HTTP helpers handle authentication, limits, schema parsing and response formats. Services take typed values and abort signals where needed. They implement application rules and own transactions. They pass the transaction's query interface to repository functions so every participating operation shares the same connection.

Repositories group SQL by the data they own. Item, transfer, conversation, token, and knowledge queries live in `src/server/repos`. Connection initialization and migration handling live in `src/server/db`. The migration runner can also access the database directly. ESLint enforces these boundaries in application and CLI source.

Components use shared types and view data. The provider index gives services and workers access to configured model and storage adapters. Zod validates server configuration, including the log level. Next.js runtime and development checks use Next.js framework variables. The CLI reads its own connection settings when it runs as an API client.
