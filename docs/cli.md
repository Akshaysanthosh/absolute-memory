# CLI

From a checkout with dependencies installed, run `npm run absolute-memory -- <command>`. `npm link` adds the `absolute-memory` command locally.

Create an API key in Settings. Set `ABSOLUTE_MEMORY_API_KEY` in your shell and run `absolute-memory login http://localhost:3000` to save it to a private configuration file. You can also pipe a key into `login --stdin`. Environment variables take precedence, and an environment key uses the environment's instance origin. For HTTPS instances, set `ABSOLUTE_MEMORY_BASE_URL` to the instance origin.

```sh
absolute-memory save 'https://example.org/article'
absolute-memory save ~/Documents/research.pdf
absolute-memory search 'reading habits'
absolute-memory ask 'What do my sources say about reading habits?'
absolute-memory export --output library.zip
```

`save` accepts URLs, supported document and media files, and UTF-8 text or Markdown notes. Run `absolute-memory --help` for `read`, `highlights`, `status`, and `note` usage. The `ask` command requires a configured chat provider. `export` creates a new ZIP at the destination path.

Run administrative commands on the instance host or in its container with the instance configuration. For an embedded database, stop the app before running commands that open that same database directly.

```sh
absolute-memory doctor
absolute-memory migrate
absolute-memory reset-password owner@example.org
absolute-memory reembed
absolute-memory import bookmarks.html --format netscape --user owner@example.org
```

`reset-password` prints a one-time link. `reembed` recreates the vector index and queues items using the current embedding model. See [Import and export](import-export.md) for the input formats.

`absolute-memory highlights` lists saved quotes with their passage links. Use `--item <item-id>` to restrict the list, `--limit <n>` to set the page size, and `--offset <n>` to continue at the returned `nextOffset`.
