# Contributing

Start with the [local development guide](docs/getting-started.md#local-development). Use Node.js 22, a fresh data directory and synthetic content.

```sh
npm ci
npm ci --prefix website
npm run dev
```

Open [localhost:3000](http://localhost:3000). For the docs site on a separate port, run `npm run website:dev -- --port 3001`. Both sites are local.

## Checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check:hygiene
npm run check:licenses
npm run docs:check
npm run website:build
```

`npm test` runs the unit and integration suites. Use `npm run test:unit` for focused logic checks and `npm run test:integration` for the database, provider and client workflows. The docs build checks internal links and anchors.

Install Playwright Chromium with `npx playwright install chromium`. Linux runners can add `--with-deps`. On macOS the application browser test uses installed Chrome and the extension test uses bundled Chromium. With Docker running, run `npm run check:release` to verify the production image and browser workflows.

Run `npm run docs:screenshots` to regenerate demo screenshots, or `npm run docs:demo` to record the README GIF and MP4. The scripts boot the production app on loopback with a fresh synthetic library and a deterministic local provider. The demo also needs FFmpeg and FFprobe on `PATH`.

## Propose a change

Take questions to [Discussions](https://github.com/Akshaysanthosh/absolute-memory/discussions). For a feature, open a feature request and describe the workflow, what you do today and how you’d tell whether the change helped. Open a bug report with reproducible steps and sanitized output.

Keep commits focused and use a short subject such as `docs: explain the Lite backup steps` or `fix: keep the active passage visible`. In the pull request, explain what changed and how you verified it. For technical decisions, see the [architecture overview](docs/architecture/overview.md).

Report security issues privately using the [security policy](SECURITY.md). Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md). See [licence status](LICENSE-PENDING.md).

<!-- TODO(owner): licence -->
