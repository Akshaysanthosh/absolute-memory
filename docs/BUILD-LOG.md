# Build log

Imported from the author's hosted application.

## Phase 1 · Bootstrap

- Imported the application snapshot into a new local working tree. Created the licence placeholder and configured the repository's local commit identity.
- Removed the first-party reporting entry points, disabled framework telemetry in the application scripts, and bundled font packages. Set up ESLint with a TypeScript/JSX parser compatible with the existing compiler.
- Passed `npm run typecheck`, `npm run lint`, `AI_ENABLED=false npm test` (278 tests), and `AI_ENABLED=false npm run build` on Node 22.23.1.
- The checkpoint records the bootstrap without adding the hosted application snapshot to Git history. Hosted-code removal and the first tracked application import follow in Phase 2. See [ADR 0001](decisions/0001-clean-import-history.md).
- Docker CLI is installed. Its selected context had no running daemon during bootstrap. Container verification belongs to Phase 11.

## Phase 2 · Remove hosted features

- Removed the marketing and preview routes, commercial account features, provider quotas, reporting, lifecycle email, remote connector sign-in, and managed media services.
- Preserved library, reader, bookmarks, notes, source extraction, per-user welcome, scoped API keys, and stdio MCP. New accounts receive the original welcome note. The browser extension defaults to a local instance.
- Retained published podcast transcript import. Video links and captured post text are saved without a transcript when no transcript is available. Uploaded audio and transcription return with the new media pipeline.
- Passed lint, typecheck, 198 tests, the production build, and the extension packaging command. Ran the app with AI disabled and verified account creation, note capture, keyword search, reader HTML, and the provider message on the Ask page.
- Kept Webpack in development as well as production after Turbopack failed to resolve the existing PostCSS plugin. Ran dependency analysis and removed unused packages. See [ADR 0002](decisions/0002-lockfile-metadata.md) for the dependency metadata exception.

## Phase 3 · Restructure

- Moved server, shared, and CLI modules into their own layers. Added import rules for Next.js routes, components, shared code, and provider adapters.
- Moved media reader data loading behind a service and passed a view model into the component. Existing routes delegate request handling to services. See [ADR 0003](decisions/0003-server-boundaries.md).
- Centralized the server settings in a Zod schema. Added startup validation and tests for defaults, aggregated errors, and secret redaction. The current AI adapters use transitional settings until their replacement.
- Passed lint, typecheck, 200 tests, and the production build. Started a dedicated local container runtime for database and deployment verification.

## Phase 4 · Database and file storage

- Rebased the schema into one baseline and introduced instance settings. Each migration and its version record commit together. PostgreSQL migrations hold an advisory lock.
- Moved uploaded originals and thumbnails to local files or configured S3-compatible storage. Originals are owner-scoped, verified by content digest, and cleaned up after deletion or an interrupted write. See [ADR 0004](decisions/0004-file-storage.md).
- Passed lint, typecheck, 199 tests, and the production build. Verified zero-to-baseline migrations on embedded PGlite and PostgreSQL 17.12 with pgvector. Two concurrent PostgreSQL migrators applied the baseline once.
- Verified local storage with filesystem-backed tests. Live S3-compatible deployment verification remains pending.

## Phase 5 · Auth and onboarding

- Added first-run owner setup, closed registration by default, owner-only expiring invites, and secure cookies for HTTPS instances. An owner or invite creates the account and welcome note in one transaction. See [ADR 0005](decisions/0005-owner-setup.md).
- Kept the existing welcome experience and fixed an early-click issue found by Playwright. Removed a remaining nested demo route.
- Added optional SMTP reset mail and a local reset command. Verified the command issued a one-time link against PostgreSQL and tested session revocation and reset-token replay in PGlite. No SMTP or OAuth credentials were used for live checks.
- Passed lint, typecheck, 200 tests, the production build, and the browser test covering setup, welcome, library, and closed registration.

## Phase 6 · AI providers

- Added OpenAI-compatible chat, embedding and transcription adapters. The chat adapter tries JSON Schema, JSON object, and prompt-based JSON as supported by the endpoint. Reader and library prompts treat saved passages as untrusted source material.
- Added provider capability settings, a connection check, and a library banner. With providers off, knowledge jobs preserve lexical indexing and finish as skipped. The checklist includes an optional provider setup step.
- The database records the first embedding model and dimension. A mismatch keeps keyword retrieval available. The local `reembed` command rebuilds the vector column and HNSW index and queues existing items again. HNSW uses pgvector's 2,000-dimension limit.
- Passed lint, typecheck, 201 tests, and the production build. PGlite tests verified no-provider indexing, dimension detection, model change, and rebuilding. A loopback mock verified format fallback, streaming, embeddings and multipart transcription.
- Verified the application's adapters with Ollama 0.40.17 in a local container on 2026-11-21. `qwen2.5:0.5b` returned the expected validated JSON and streamed a reply. `all-minilm` returned one 384-dimensional vector for a synthetic input. See the [provider guide](providers.md) for configuration examples. Other providers in the guide were checked against their API documentation.

## Phase 7 · Capture and media

- Consolidated bounded URL retrieval for articles, feeds and metadata. The downloader uses an HTTPS proxy that applies the same address rules to CDN and redirected hosts. Tests cover private IPv4 and IPv6 rejection, DNS checks, redirects, byte limits and timeouts. See [ADR 0006](decisions/0006-media-fetch-and-storage.md).
- Added caption-first YouTube imports, published podcast transcript preference, audio downloads for configured transcription, social post text and metadata fallback, and audio/video uploads. Uploads queue transcription and release the staged original on completion. Direct Apple Podcasts and Spotify saves still resolve RSS identity before enqueuing audio processing so equivalent directory URLs deduplicate immediately.
- Verified the capture worker against Blender Foundation's public [Sintel upload](https://www.youtube.com/watch?v=eRsGyueVLvQ) with yt-dlp 2026.10.26. It saved the item as ready with 26 English caption cues and 31 reader blocks while transcription was off. Ran ffmpeg 7.1 on a 2.5-second synthetic audio file through the transcription adapter and verified the saved cue timing against the fixture provider.
- Passed lint, typecheck, 207 tests and the production build. Live third-party social imports and hosted transcription credentials were outside these checks.

## Phase 8 · Search and cited chat

- Library and integration search rank English full-text matches from titles and indexed passages. When available, pgvector adds semantic candidates. Reciprocal rank fusion groups candidates by item and the result cursor includes relevance and creation order. Type, tag, topic, saved dates and import status apply before ranking.
- Added number-based citations from chat to the saved passage anchor. The chat composer now labels its editable input directly for assistive technology. See the [search architecture](architecture/search.md).
- Passed lint, typecheck, 207 tests and the production build. PGlite tests verified hybrid ranking, pagination, filters, owner isolation and fallback while embeddings need a rebuild. A PostgreSQL 17 smoke test migrated a fresh database and found a saved title using keyword search.
- Passed the browser check with the mock provider. After setup, it saved a long note, asked about a passage, clicked citation 1 and verified the anchored reader block scrolled into view.

## Phase 9 · Portable transfer and samples

- Added the versioned ZIP export with originals, Markdown, highlights, note documents, chats, and graph evidence. The importer verifies file digests and remaps saved citations to the receiving account. Graph evidence is available in the archive. The worker regenerates derived graph data and embeddings after restore.
- Added six legacy importer formats, background transfer status and downloads in Settings, and durable import checkpoints. Portable restores commit as one transaction. Legacy transfers commit up to 100 items with each progress update. The transfer UI accepts ZIPs up to 256 MiB.
- New accounts receive the original welcome note. The library can queue sample links on demand, preserves existing user saves during deduplication, and removes sample items independently.
- Passed lint, typecheck, 217 tests and the production build. Tests verified each importer, an interrupted job resuming with no duplicate saves, and a ZIP round trip into another account preserving the original file bytes and saved passage citations. A production-server smoke test signed in, queued an export, downloaded it and opened its manifest.

## Phase 10 · HTTP, CLI, MCP and extension

- Versioned item listing, search, file upload, highlights, tags, cited answers and ZIP export are available through scoped API keys. The server serves an OpenAPI 3.1 document from the Zod contracts. API keys support an optional expiration date.
- CLI commands now include local login, file saves, questions, exports, migrations and imports. The CLI saves credentials with owner-only file permissions. MCP stdio provides the requested read and save tools while retaining the earlier tool names for existing clients.
- Passed lint, typecheck, 217 tests, the production build and extension packaging. Used the MCP client SDK to invoke tools over stdio. A running production instance verified CLI URL capture, search, PDF upload and deduplication, ZIP export, and the OpenAPI route. See the [API guide](api.md), [CLI guide](cli.md), [MCP configuration](mcp.md) and [extension guide](extension.md).

## Phase 11 · Containers and operations

- Built one non-root image for Lite, Standard web, and the Standard worker. Added a migration entrypoint, role-aware health checks, and a 30-second worker heartbeat. The image pins Node, FFmpeg, and yt-dlp. See [ADR 0007](decisions/0007-container-runtime.md).
- Built and booted the final ARM64 image. It measures about 194 MB by registry content size and 578 MiB in the running filesystem. Lite passed owner setup, save, reader and worker checks. Standard reported all three services healthy and indexed a save through the separate worker.
- `doctor` passed all checks in Lite using the mock chat, embedding, and transcription endpoints. Verified container FFmpeg normalized a one-second stereo fixture into 32,000 bytes of 16 kHz mono PCM. Verified S3-compatible upload, digest-checked read, and deletion against a loopback S3 test service.
- Added optional Ollama and S3 Compose configuration. The MinIO override accepts an operator-built image or a separate S3 endpoint because the former public upstream image was unavailable. The first AMD64 build ran under emulation. The final AMD64 verification is recorded in Phase 15.
- Passed lint, typecheck, 218 tests, and the production build. See [Getting started](getting-started.md) for local operations.

## Phase 12 · Settings and AI-off UI

- Settings now has eight sections with keyboard-operable tabs and links to specific sections. The owner sees Invites. Extension setup moved to Settings and existing Connections links redirect there.
- The library, reader and detail views now respect the configured chat capability. Verified reading, highlighting and keyword search with chat disabled. The direct Chat route explains how to enable it.
- The configured per-file upload limit applies to PDFs, workbooks, images, and media. The capture dialog shows that same limit.
- Passed lint, typecheck, 218 tests, the production build, and Playwright with AI off and with the mock provider. The browser tests checked closed signup, keyboard Settings tabs and citation navigation to a passage. A development-only reader warm-up keeps first-time compilation outside the citation navigation timeout.

## Phase 13 · Security and release checks

- Added nonce-based script CSP and shared rate limiting across auth, capture, and API entry points. PostgreSQL enforces the Standard counters atomically. Lite uses bounded in-process state. Runtime error reporting omits request content, provider warning payloads, and exception messages.
- Added production-image Playwright coverage for owner setup, closed signup, article capture, reader highlights, keyword search, cited chat, ZIP export, and signing out and back in. The bundled Chromium test verified the unpacked extension's worker and connection page. The protocol and retry behavior also have integration fixtures.
- Added both GitHub workflows, local release checks, licence inventory and history hygiene, owner assignments, and contribution templates. See [ADR 0008](decisions/0008-request-security-and-ci.md).
- The full local release script passed. It ran lint, typecheck, 221 tests, production and ARM64 container builds, Docker health and provider checks, both browser tests, extension packaging, and licence and repository hygiene. The optional PostgreSQL test separately passed against a fresh PG17 database. The workflow files passed actionlint.
- Confirmed the app's transcription adapter accepts a timed response from local Whisper.cpp 1.9.3 using a synthetic WAV. Claude Code showed the stdio MCP server connected using temporary client configuration and a synthetic key shape. The MCP SDK integration exercises actual authenticated tool calls.

## Phase 14 · Public documentation

- Added the self-hosted quick start, feature status, provider and integration entry points, and public operations guides. Documented outbound connections for capture, previews, providers, and configured services.
- Added Mermaid architecture diagrams for process boundaries, background jobs and knowledge generation. Added contribution, private reporting, and trademark policies. The README reserves a place for the owner's demo recording.
- Generated the configuration reference directly from the Zod fields and defaults. CI fails if the generated file drifts. Checked local Markdown links and ran lint, typecheck, 221 tests, and the production build. A fresh clone using cached Docker layers reached the first persisted keyboard highlight in 9 seconds. The instance used a local article fixture and had AI disabled.

## Phase 15 · Release candidate 0.1.0

- Verified the final tree with the local release script. Lint, typecheck, 221 unit and integration tests, the production build, instance health and provider diagnostics, two Docker Playwright tests, extension packaging, configuration generation, licence and history hygiene all passed. The PostgreSQL concurrency check ran separately.
- Built ARM64 and AMD64 images. After the initial emulated AMD64 build exceeded the VM's memory, a larger dedicated VM and Webpack's memory optimization allowed the final build to finish. Both architectures passed the Docker Playwright tests. Standard passed PostgreSQL, web and worker health checks and saved a readable note.
- Restored a portable ZIP into a second empty Lite database and verified that note text and highlights survived the transfer with a remapped ID. A separate test used real local Ollama for chat and embeddings, and local Whisper.cpp for transcription. FFmpeg normalized the uploaded clip in the app container. The authenticated CLI found the resulting transcript.
- The installation path uses a locally built image. The first source build depends on network speed, architecture and build cache. Registry publishing remains an owner action.
- Verified the MCP tools through the SDK, connected Claude Code with a temporary configuration, and discovered the tools with the Cursor CLI. The isolated Claude Desktop profile did not start the MCP server before sign-in. Signed-in Claude Desktop and Cursor editor checks are listed in the [release checklist](RELEASE-CHECKLIST.md).
- Validated external podcast directory data before reading it and removed the two remaining explicit `any` annotations from application code. The licence choice remains with the owner. The [release checklist](RELEASE-CHECKLIST.md) covers the licence, public repository, registry, demo recording and trademarks.
- Follow-up privacy audit made third-party browser images opt-in through `ALLOW_REMOTE_IMAGES=true`. A production browser probe verified zero requests by default in ARM64 and a successful load after opt-in in AMD64. The full local release checks passed again.
- Timed two fresh-clone ARM64 runs with Docker's build cache disabled. They reached a persisted highlight in 187 and 364 seconds with AI disabled. The build now skips an unused yt-dlp archive download and still verifies the executable digest. A fresh clone using the final prebuilt image reached the same highlight in 4 seconds. Both production-image Playwright tests also passed on that image.

## Fix round 1

### Phase 1 · Minimal Reader

- The deletion commit `b9b9823` removed the previous article importer, Reader, rich annotations, item comments, per-item discussion, and their tests and styles. The replacement [Reader design](architecture/reader.md) and [ADR 0009](decisions/0009-minimal-reader.md) document stored HTML, timed passages, citation fragments, and single-colour highlights.
- The pre-fix baseline at `78978fe` passed 221 tests and two browser journeys. One optional PostgreSQL test passed separately. Tracked application, CLI, script and extension source comprised 412 files and 22,199 lines, with 959 lines longer than 160 bytes and three files longer than 400 lines.
- Focused tests verified the new passage index and owner-scoped citations, highlight search, theme contrast, transcript cue storage, and portable archive restoration with copied reading images. Lint, typecheck, 174 unit and integration tests, the production build, repository hygiene, configuration docs and the dependency inventory passed. One optional PostgreSQL test was skipped in this run. Both Playwright suites passed against a local production build with a synthetic article and the mock provider. The screenshots were refreshed in Fix round 2.
- The local hygiene gate uses the deletion manifest during the rebuild. The release branch audit will compare those blob IDs by Git metadata and scan the whole fresh clone.
- Live extraction regression results below record passage and candidate image counts before copy limits. Lead images come from metadata. The run did not store article text.

| Source                                          | Passages | Inline image candidates | Lead | Result                      |
| ----------------------------------------------- | -------: | ----------------------: | ---- | --------------------------- |
| Wikipedia, Map                                  |     1006 |                      54 | Yes  | Extracted                   |
| Wikipedia, Solar eclipse                        |      412 |                      59 | Yes  | Extracted                   |
| Project Gutenberg, Pride and Prejudice          |        — |                       — | —    | HTTP 503                    |
| arXiv, Denoising Diffusion Probabilistic Models |       10 |                       0 | Yes  | Extracted                   |
| W3C, EPUB 3.3                                   |     3408 |                       4 | No   | Extracted                   |
| MDN, HTML article element                       |       43 |                       0 | Yes  | Extracted                   |
| National Park Service, rock cycle               |        — |                       — | —    | HTTP 404 for the tested URL |
| RFC Editor, HTTP Semantics                      |     3658 |                       0 | No   | Extracted                   |
| SQLite, Appropriate Uses for SQLite             |       50 |                       0 | No   | Extracted                   |
| Python documentation, tutorial why.html         |        — |                       — | —    | HTTP 404 for the tested URL |

The follow-up run used the NASA eclipses page and the Python tutorial introduction in place of the two missing pages. NASA extracted 23 passages and four inline image candidates, with a lead image. The Python tutorial extracted 105 passages and no inline image candidates, with a lead image. Project Gutenberg's direct HTML endpoint also returned HTTP 503 in this environment.

### Phase 2 · Authentication and transfer security

- Added separate normalised-email quotas for sign-in and password reset, plus a reset-token quota. Trusted proxies may supply the client address. Resolved keys use per-user quotas, and invalid keys use a separate anonymous quota.
- Password writes revoke personal API and extension keys inside the password-change transaction. The reset confirmation includes those revocations. Keys default to 90 days and require an explicit choice for permanent access. Provider diagnostics and model identifiers are available to the instance owner.
- Added a database-backed limit of one active import and one active export per account. Uploads and exports stream to storage. Archive entries expand one at a time to temporary files with configurable byte and entry limits, and metadata has a separate cap.
- The regression tests detected the original quota, revocation, permissions and duplicate-job failures. The revised full suite passed 180 tests. The optional PostgreSQL rate-limit test passed against a fresh PostgreSQL 17 container. The production build, lint, typecheck, repository hygiene, configuration docs, and dependency inventory passed.

### Phase 3 · Source formatting

- Formatted the repository with Prettier at a 100-column print width, expanded chained React state declarations, and removed unused library quota styles. CI and the local release script now run the formatting check.
- The ESLint line rule enforces 160 characters outside URLs and string literals. Probes verified enforcement in TypeScript, CSS, and SQL as well as both exceptions. After the pass, 379 application, CLI, script and extension source files contained 41,703 lines. The 66 lines longer than 160 bytes fall under the lint exceptions. Twenty files exceeded 400 lines and are candidates for the layering pass.
- Lint, formatting, typecheck, 180 tests, the production build, repository hygiene, configuration docs, and the dependency inventory passed. The optional PostgreSQL check was skipped in this run.

### Phase 4 · Application boundaries

- Account session, extension token and API key routes now own their HTTP handling. Session and token repositories own their queries, and token issuance keeps quota checks and writes in one transaction. Logging reads the validated log level. Lint, formatting, typecheck, 180 tests, the production build, hygiene and configuration docs passed.
- Library list, filters, topic names and revision now have explicit handlers and typed service calls. Ranked search and list metadata live in repositories. The search service still handles embedding lookup, paging, and preview decoration. All 180 tests and the production, formatting, lint, typecheck, hygiene and configuration checks passed.
- Onboarding and sample routes parse requests in their route files. The services coordinate checklist state, sample ordering and transactional seeding with dedicated repositories. The full test suite passed with 180 tests, and lint, typecheck, build, hygiene and configuration documentation checks passed.
- Item capture, bookmark changes, retries and status reads call repositories for item, import-job and media persistence. The item mutation route calls a typed service and the quote capture has its own module. Lint, formatting, typecheck, 180 tests, production build, hygiene and configuration checks passed.
- Document upload and preview routes now own file headers and response bodies. Typed services handle document rendering and save processing, and repositories handle metadata, previews, image analysis and duplicate lookup. All 180 tests and the lint, formatting, typecheck, production build, hygiene and configuration checks passed.
- Note, topic page and Ask routes use typed services and repositories. The Ask route encodes answer events as newline-delimited JSON. The service retains cancellation, checkpoints and citation validation. All 180 tests and the production build, lint, formatting, typecheck, hygiene and configuration checks passed.
- Transfer routes handle upload streams and ZIP responses. Job leases, snapshot reads and archive restoration writes are in repositories. The import and export tests passed with the rest of the 180-test suite, along with lint, formatting, typecheck, build, hygiene and configuration checks.
- The personal API and health endpoints own their HTTP adapters. Integration saves, extension connections, quota counters and health queries use named repositories. The API contract and OpenAPI builder share schemas. All 180 tests and lint, formatting, typecheck, build, hygiene and configuration checks passed.
- Article and media workers keep lease and transaction orchestration in worker modules and use repositories for persistence. The podcast route parses the selection, and its playback route maps typed stream metadata to HTTP. The request-handler service directory is gone. Tests, formatting, lint, typecheck, build, hygiene and configuration checks passed.
- Knowledge retrieval, tag updates, graph assembly, citation checks and indexing now have focused service and repository modules. ESLint rejects query calls outside the data layer and request types in services. Eight lint probes exercised both boundaries. The full 180-test run passed after replacing wall-clock waits in the heartbeat test with a controlled clock. The production build, lint, formatting, typecheck, hygiene and configuration checks passed.
- Split library, Ask, note editor, capture, graph and item details into focused components and hooks. Split the larger stylesheets, preserving cascade order and module class composition. Removed 150 unused global selectors, the unused alternate chat layout, and legacy Reader citation styling. All 180 tests, both production browser journeys and the build, lint, formatting, typecheck, hygiene and configuration checks passed.
- Split migration 0001 into three ordered SQL files. The migrator applies all three under the same version and transaction and recognises already-installed versions. The fresh database and migration retry tests, 180-test suite, production build, lint, formatting, typecheck, hygiene and documentation checks passed.

### Phase 5 · Test and repository tidy-up

- Organised tests into unit, integration, browser and fixture directories. Added focused checks for rank fusion, VTT and SRT timing, structured model output, and public-address classification. A mock-provider integration test saves an article, indexes it, exercises keyword and semantic search, asks a question, and verifies the cited Reader fragment.
- Removed the production repair scripts, unused font files and dependencies, and older citation-key parsing. The MCP tool list retains `search_memory` and `get_item`. The supported Next.js `agentRules` setting keeps the generated instruction file out of the tree. Verified this in a local development boot.
- The full suite passed 185 tests, with one PostgreSQL-only test skipped. The separately configured PostgreSQL 17 run passed its migration and concurrent quota checks. Lint, formatting, typecheck, production build, hygiene, configuration documentation and third-party inventory checks passed.

### Phase 6 · Installation and release checks

- The README now opens with a Reader screenshot and puts the Docker install paths before the feature table. The demo slot is commented out until the recording exists. The prebuilt command is marked available after release. Added local development, architecture links and the CI badge.
- Reviewed how established self-hosted projects surface installation, docs and demos. Used short navigation links, a visual preview and a runnable source path in the README. [Immich](https://github.com/immich-app/immich) · [FreshRSS](https://github.com/FreshRSS/FreshRSS) · [Linkwarden](https://github.com/linkwarden/linkwarden)
- The image workflow checks AMD64 and ARM64 builds and gates provenance publishing on `PUBLISH_IMAGES` for version tags. The Docker build context includes the baseline migration parts. Both workflows passed actionlint.
- The full local release script passed with 185 tests, the optional PostgreSQL check skipped, and both Docker Playwright journeys passing. The Linux ARM64 image also reached health in three seconds with a fresh Lite volume and rendered owner setup. This timing starts from the locally built image. All 33 Markdown pages passed the local file-link check.
- The final application, CLI, scripts and extension comprise 448 source files and 42,432 lines. The 63 lines longer than 160 bytes are allowed by the literal and URL exceptions. Every tracked source, SQL and test file is at most 400 lines.

### Phase 7 · Release history

- The local `release` branch contains one root commit. The local `pre-clean-history` tag keeps the working history for the owner. The release check runs against a fresh clone of the root commit.
- The history audit compares reachable release objects with the blob IDs of all 71 paths removed by the Reader deletion commit at the pre-fix baseline. There are zero matching blob IDs. The independent similarity review remains an owner release check.

## Fix round 2

### Phase 1 · Retired palette

- The extension uses Astryx neutral options and badge colours. The global error screen uses neutral surface, text and status tokens. Capture, detail, graph, library, setup and note editing styles now use theme roles for shared UI colours.
- The tracked-file palette test checks the 105 listed values case-insensitively. No Astryx values used in the extension needed a collision adjustment.
- The remaining literal-colour inventory follows the final Reader and screenshot changes below.

### Phase 2 · Reader

- The Reader shares the library's Astryx theme. A compact sticky bar has a library link, title, progress indicator, Appearance popover and keyboard help. The article heading puts the byline, source, date and reading time together. A saved lead image uses the article's measure and the theme's radius.
- Source Serif 4 is self-hosted under OFL-1.1. Its optical-size and weight axes support both long passages and larger titles, with upright and italic faces. The interface uses the app's sans serif. [Fontsource](https://fontsource.org/fonts/source-serif-4/about)
- The highlight uses Astryx warning and on-warning roles, and the contrast test checks those colours, metadata, links, surfaces and the progress indicator. Failed imports can be retried from the Reader using the existing item retry endpoint.

### Phase 3 · README and screenshots

- The temporary demo library contains four articles with generated covers, a note, a generated PDF, and a timed transcript. The mock provider supplies summaries, tags and a cited answer. Playwright captures the production app and checks the Reader at 375px, 768px and 1280px.
- The README uses the [library](media/library.png) as the hero and shows the [Light Reader](media/reader-light.png) and [Ask citation landing](media/ask-citation.png). It also links to the [Dark Reader](media/reader-dark.png) and [mobile Reader](media/reader-mobile.png).

#### Remaining literal colours

The Reader has no literal hex colours. The remaining values in components are grouped below.

- Provider and source logos and platform badges preserve each mark’s colours. `#000`, `#0f9d58`, `#14161a`, `#1877f2`, `#1d9bf0`, `#34a853`, `#3dd598`, `#4285f4`, `#7fb2ff`, `#8c3ff0`, `#8e44ef`, `#db4437`, `#e1306c`, `#e5252a`, `#e60023`, `#ea4335`, `#fbbc05`, `#fe2c55`, `#ff0000`, `#ff0033`, `#ff4500`, `#ff6a4d`, `#ffcd40`, `#ffd23f`, `#fff`, `#fffdf7`.
- Library card artwork keeps its original gradients, image scrims, placeholder fills, and text designed for those backgrounds. `#0002`, `#0005`, `#0007`, `#080e0b`, `#080e0b45`, `#080e0bee`, `#101010`, `#101916a3`, `#16352c`, `#172c22`, `#1d293b`, `#222e28`, `#253c38`, `#303030`, `#304e46`, `#343d54`, `#58617e`, `#688274`, `#8bc5a6`, `#c1d6c9`, `#c7d4cc`, `#c8d3ce`, `#d4d4d4`, `#d5d7f24d`, `#dae7dc`, `#e1ecdf29`, `#e4e4ee`, `#f1f8f0`, `#f3c792`, `#f3f7f4`, `#fff`, `#ffffff10`, `#ffffff29`, `#ffffff2b`.
- Graph canvas keeps literal fallbacks for its node, edge and label colours. Canvas expects resolved colour strings. `#202522`, `#25634b`, `#425fd6`, `#737373`, `#87948b`, `#a3a3a3`, `#fafafa`.
- Scrims and elevation fallbacks preserve existing opacity outside the theme scope. `#0000000f`, `#00000012`, `#00000033`, `#00000040`, `#00000059`, `#0001`, `#0002`, `#0003`, `#0004`, `#0005`, `#0006`, `#0007`, `#0008`, `#0009`, `#000b`, `#10171488`, `#111`.
- The extension copies its neutral palette into `extension/tokens.css` and `extension/tokens.mjs`. Chrome’s badge API requires concrete colours.

### Phase 4 · Release verification

- The release candidate uses the final `round-2` tree in a single root commit. Verification uses a no-local, single-branch clone without tags, checks the 71 retired blob IDs and the 105 palette values, then runs the full release check, including Docker and both browser suites.
- The Docker build context excludes the documentation screenshot scripts, which use Playwright and the mock provider from the contributor checkout.

## Fix round 3

### Phase 1 · Standard library

- A fixed workspace rail serves the library, Chat, Graph, Highlights and Settings. The rail becomes a bottom tab bar below 768px. The Reader keeps its own navigation.
- The library has one uniform card grid ordered by saved date. Topics are a fixed panel on desktop and a modal drawer on smaller screens. Search, type and topic filters, item actions, details and paged loading use the existing library data.
- Removed the previous collection implementations and their layout preferences. The [layout decision](decisions/0010-standard-library-layout.md) records the trade-offs.

### Phase 2 · Reader appearance

- The Reader defaults to Light and offers Light and Dark in Appearance. Existing Dark choices keep their theme. Older browser-following choices resolve to Light and keep their saved size and width.

### Phase 3 · Source names and copy

- Library cards prefer the imported site name, then the stored host. Demo article labels now read Fieldwork Journal, Rain Ledger, City Edges and Repair Register.
- Counted labels share English plural rules. The mobile Reader wraps metadata with spacing between fields.

### Phase 4 · Screenshots and release

- The production demo adds a timed planning-call transcript alongside the original podcast. The capture script checks the 1440px desktop grid, 1024px panel, 768px drawer and rail, and 375px bottom tabs. It verifies dark appearance, topic filtering, saved panel preference, and the Reader’s fallback for older appearance settings.
- Playwright captures six images at 2× scale. The [desktop library](media/library.png) uses a 1440×900 CSS viewport. The [mobile library](media/library-mobile.png) uses a 375px viewport. [Light Reader](media/reader-light.png), [Dark Reader](media/reader-dark.png), [mobile Reader](media/reader-mobile.png), and [Ask citation](media/ask-citation.png) show the reading flow.
- The release uses the final working tree in one root commit. The fresh clone check verifies Git object exclusions, the palette fixture, and the full production release suite.

## Private publish

- The card action button uses the theme’s popover surface, a border and subtle shadow. The demo suns sit in the middle third of the cover, clear of the corner controls.
- The private target is [Absolute Memory](https://github.com/Akshaysanthosh/absolute-memory). The previous preview has a separate [archive URL](https://github.com/Akshaysanthosh/absolute-memory-preview-archive). The offline pre-release bundle is named `absolute-memory-prerelease-2026-11-22.bundle` and is kept in the owner’s `absolute-memory-archive` folder.
- The [release commit on main](https://github.com/Akshaysanthosh/absolute-memory/commit/main) is the single root commit. Dependabot version updates are off until the public launch, when the owner will restore the configuration file. Dependabot security alerts remain enabled.
- The owner will choose a licence and public launch date, record the demo GIF, and test MCP while signed in to Claude Desktop and Cursor. The owner can decide later whether to delete the archived preview.
