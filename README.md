# Absolute Memory

Save articles, documents, and media in a library you run yourself. Highlight what matters, find it later, and use an optional AI provider to ask questions with links back to the original passages.

[![CI](https://github.com/Akshaysanthosh/absolute-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/Akshaysanthosh/absolute-memory/actions/workflows/ci.yml)

![Desktop library with the left navigation rail, Topics panel, and eight cards for articles, a podcast, a PDF, a note, and a transcript](docs/media/library.png)

[See the mobile library with bottom navigation](docs/media/library-mobile.png)

[Quick start](#quick-start) · [Deployment guide](docs/getting-started.md) · [Documentation](docs/README.md) · [Changelog](CHANGELOG.md)

<!-- ![Save, highlight, search, and follow a citation](docs/media/demo.gif) -->

## Quick start

You'll need a running Docker installation and OpenSSL. The container supports Linux AMD64 and ARM64.

### Use the prebuilt image

**Available after the first release.** The command starts Lite and keeps the library in a named volume.

```sh
docker run -d --name absolute-memory -p 127.0.0.1:3000:3000 -v absolute-memory-data:/data -e AUTH_SECRET="$(openssl rand -base64 32)" ghcr.io/akshaysanthosh/absolute-memory:0.1.0
```

### Build from source

Install Git and run these commands.

```sh
git clone https://github.com/Akshaysanthosh/absolute-memory.git
cd absolute-memory
docker build -t absolute-memory:local .
docker run -d --name absolute-memory \
  -p 127.0.0.1:3000:3000 \
  -v absolute-memory-data:/data \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  absolute-memory:local
```

1. Open [http://localhost:3000](http://localhost:3000) and create the owner account.
2. Select **Add** and save an article URL.
3. Open the saved article, select a sentence, and choose **Highlight**.
4. Find the quote in **Highlights**, open it, and use **Appearance** to switch between Light and Dark.
5. Search your library for a word from the quote. With a chat provider configured, open **Ask**, ask about the article, and follow a citation to its passage.

Both commands start **Lite**, with the app, worker, and PGlite database in one container. Keep the `absolute-memory-data` volume when replacing the container. The first source build downloads dependencies and media tooling, so its duration varies by connection and machine. For separate web and worker services with PostgreSQL, follow the [Standard deployment guide](docs/getting-started.md#standard).

Check the instance from your terminal with `docker exec absolute-memory absolute-memory doctor`.

## What you can do

| Feature                                                                  | Status                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Save articles, notes, PDFs, workbooks, screenshots, and supported media  | Stable for articles, notes, and document capture. Media support varies by source. |
| Read, save basic highlights, and search by keyword                       | Stable                                                                            |
| Export your library as a ZIP and restore it on another instance          | Stable                                                                            |
| Generate summaries, search semantically, and chat with passage citations | Beta                                                                              |
| Connect the Chrome extension, HTTP API, CLI, or an MCP client            | Beta                                                                              |
| Generate automatic graph connections and image descriptions              | Experimental                                                                      |

### Read and highlight

![Light Reader showing A cooler roof for the library, its cover illustration, and a highlighted sentence](docs/media/reader-light.png)

[See Dark Reader](docs/media/reader-dark.png) · [See Reader on a 375px phone](docs/media/reader-mobile.png)

### Ask and follow a citation

![Chat answers a question about the roof sensor beside the workspace rail. The Reader opens the cited sentence about unshaded gravel on the right.](docs/media/ask-citation.png)

Reading, highlights, keyword search, and library transfers work with AI disabled. Absolute Memory sends no telemetry. See the [network and privacy guide](docs/privacy.md) for when captures and configured services make requests.

Colour highlights, passage notes and the reading assistant are available in the hosted edition at absolutememory.app.

## How it works

The Reader stores sanitised HTML and numbered passages. Highlights keep their quote and passage offsets, and Ask uses the same passage numbers to link answers back to your reading. Keyword search runs locally. Add an embedding provider to rank related passages by meaning. See the [Reader architecture](docs/architecture/reader.md) and [search and citations](docs/architecture/search.md).

## Connect AI or MCP

| Provider            | Capabilities                                        |
| ------------------- | --------------------------------------------------- |
| OpenAI              | Chat, embeddings, and transcription                 |
| DeepSeek            | Chat and structured summaries                       |
| OpenRouter          | Chat with a supported model                         |
| Ollama or LM Studio | Local chat and embeddings with installed models     |
| Local Whisper       | Transcription through an OpenAI-compatible endpoint |

Follow the [AI provider guide](docs/providers.md) to configure an endpoint. To connect an MCP client, create a personal key under **Settings → API keys**, then follow the [stdio setup guide](docs/mcp.md).

## Develop locally

Use Node.js 22 and npm from the repository root.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server uses PGlite and stores data in `./data` by default. Add an `.env.local` file if you want to override settings. Run `npm test` for the unit and integration suites and `npm run test:e2e` for Playwright. See [Contributing](CONTRIBUTING.md) for the full verification workflow.

## Documentation

- **Install and operate** · [Deployment profiles](docs/getting-started.md), [configuration](docs/configuration.md), [backups](docs/backup.md), [upgrades](docs/upgrading.md), and [hardening](docs/hardening.md)
- **Use your library** · [Media capture](docs/media.md), [import and export](docs/import-export.md), and [export format](docs/export-format.md)
- **Integrate** · [Chrome extension](docs/extension.md), [HTTP API](docs/api.md), [CLI](docs/cli.md), and [MCP](docs/mcp.md)
- **Contribute** · [Development and testing](CONTRIBUTING.md), [architecture](docs/architecture/overview.md), and [security reporting](SECURITY.md)

The project licence is [pending](LICENSE-PENDING.md). See the [third-party notices](THIRD_PARTY_NOTICES.md) for dependency credits.
