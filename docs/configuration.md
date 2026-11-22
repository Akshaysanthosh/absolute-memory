# Configuration

Generated from the server's Zod schema. Run `npm run docs:config` after a schema change.

Set these variables in the server environment. For local development use `.env.local`. Standard Compose reads `.env`. Keep credentials out of version control. The schema rejects invalid combinations during startup.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Application mode. Containers use production and development uses local defaults. |
| `APP_URL` | `http://localhost:3000` | Browser origin, including the scheme and any non-default port. Supply an HTTPS origin behind TLS. |
| `AUTH_SECRET` | Unset | Session signing secret. Production requires at least 32 characters. Keep the same value across restarts and replicas. |
| `DATABASE_URL` | Unset | PostgreSQL connection URL. Leave unset to use PGlite in Lite. |
| `DATA_DIR` | `./data` | Directory for local files and the PGlite database. The container uses /data. |
| `ROLE` | `all` | Process role. Use all in Lite, or web and worker in Standard. |
| `MIGRATE_ON_START` | `true` | Apply pending schema migrations at startup. |
| `ALLOW_SIGNUP` | `false` | Allow public registration once the instance has an owner. Invitations work with signup closed. |
| `AI_BASE_URL` | Unset | OpenAI-compatible chat base URL. Required when AI_MODEL is set. |
| `AI_API_KEY` | Unset | Optional key for the chat endpoint. |
| `AI_MODEL` | Unset | Chat model ID. Enables chat and summaries when the endpoint is configured. |
| `AI_STRUCTURED_OUTPUT` | `auto` | Structured chat responses. Use auto, json_schema, json_object, or prompt. |
| `EMBEDDINGS_BASE_URL` | Unset | Embedding base URL. Defaults to the chat endpoint when set. |
| `EMBEDDINGS_API_KEY` | Unset | Optional embedding key. Reuses the chat key when using the chat endpoint. |
| `EMBEDDINGS_MODEL` | Unset | Embedding model ID. Enables the semantic search index. |
| `EMBEDDINGS_DIMENSIONS` | Unset | Vector width, up to 2000. Learns the width from the first response if unset. |
| `TRANSCRIPTION_BASE_URL` | Unset | OpenAI-compatible transcription base URL. Required with TRANSCRIPTION_MODEL. |
| `TRANSCRIPTION_API_KEY` | Unset | Optional key for the transcription endpoint. |
| `TRANSCRIPTION_MODEL` | Unset | Transcription model ID. |
| `MEDIA_ENABLED` | Unset | Enable media tooling. Automatically detects availability when unset. |
| `MEDIA_MAX_DURATION_MINUTES` | `180` | Maximum duration of media submitted for audio processing. |
| `YTDLP_COOKIES_FILE` | Unset | Path to an optional Netscape cookie file for authorized yt-dlp downloads. |
| `STORAGE_DRIVER` | `local` | Store originals and temporary artifacts with local or s3 storage. |
| `S3_ENDPOINT` | Unset | Optional S3-compatible service URL. |
| `S3_REGION` | Unset | Bucket region. Required for S3. |
| `S3_BUCKET` | Unset | Bucket name. Required for S3. |
| `S3_ACCESS_KEY_ID` | Unset | S3 access credential. Required for S3. |
| `S3_SECRET_ACCESS_KEY` | Unset | S3 secret credential. Required for S3. |
| `S3_FORCE_PATH_STYLE` | `false` | Use bucket names in the path for services that require path-style URLs. |
| `SMTP_URL` | Unset | SMTP or SMTPS connection URL for password reset email. |
| `MAIL_FROM` | Unset | Sender address for password reset email. Required with SMTP_URL. |
| `GOOGLE_CLIENT_ID` | Unset | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Unset | Google OAuth client secret. |
| `GITHUB_CLIENT_ID` | Unset | GitHub OAuth client ID. |
| `GITHUB_CLIENT_SECRET` | Unset | GitHub OAuth client secret. |
| `MAX_UPLOAD_MB` | `50` | Maximum size of an individual file in MiB. Portable ZIP import has a separate cap. |
| `TRANSFER_MAX_UPLOAD_MB` | `256` | Maximum compressed or plain transfer upload size in MiB. |
| `TRANSFER_MAX_EXPANDED_MB` | `512` | Maximum total uncompressed size of a library archive in MiB. |
| `TRANSFER_MAX_ENTRY_MB` | `64` | Maximum uncompressed size of one archive entry in MiB. |
| `TRANSFER_MAX_ENTRIES` | `100000` | Maximum number of entries in a library archive. |
| `TRANSFER_MAX_METADATA_MB` | `64` | Maximum aggregate bytes of library archive metadata in MiB. |
| `ALLOW_PRIVATE_NETWORK_FETCH` | `false` | Allow capture fetching from private networks. Defaults to blocking those destinations. |
| `ALLOW_REMOTE_IMAGES` | `false` | Allow the browser to load third-party images referenced by saved content. |
| `TRUST_PROXY` | `false` | Use the X-Real-IP request header from a trusted proxy for client rate limits. |
| `LOG_LEVEL` | `info` | Minimum application log level. Choose debug, info, warn, or error. |
| `REDDIT_CLIENT_ID` | Unset | Reddit OAuth client ID for post retrieval. |
| `REDDIT_CLIENT_SECRET` | Unset | Reddit OAuth client secret. |
| `INTEGRATION_API_ENABLED` | `true` | Enable the personal API and integrations. |
| `AM_TEST_DB` | Unset | Test-only setting. The memory value starts a temporary in-memory PGlite database. |

## Docker Compose and helper settings

| Variable | Description |
| --- | --- |
| `AM_PORT` | Host port published by the Lite helper and Standard Compose. Defaults to 3000. Match `APP_URL` to your browser's origin. |
| `POSTGRES_PASSWORD` | Password for Standard Compose's database. Generate a random value with `openssl rand -hex 24`. |
| `MINIO_IMAGE` | Optional local MinIO image tag for the storage override. |
| `PORT`, `HOSTNAME` | Listener settings for Next.js standalone. In Docker, defaults are `3000` and `0.0.0.0`. |
| `NEXT_TELEMETRY_DISABLED` | Set to `1` by the application scripts and container. |

See the [provider recipes](providers.md) and [deployment guide](getting-started.md).
