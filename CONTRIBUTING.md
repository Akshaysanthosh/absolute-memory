# Contributing

Start with the [local development guide](docs/getting-started.md#local-development). Use a fresh data directory and synthetic data when debugging.

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run test:unit` for small logic checks and `npm run test:integration` for database, provider and client workflows. `npm test` runs both.

Install the bundled Chromium browser with `npx playwright install chromium`. Linux runners can add `--with-deps`. On macOS the application browser test uses installed Chrome and the extension test uses bundled Chromium. With Docker running, execute `npm run check:release` for the release checks, including the production-image browser journey.

Run `npm run docs:screenshots` to regenerate the six README images. The script builds the production app, boots it on loopback with a fresh temporary library and a mock provider, and uses Playwright to capture the app at twice the CSS pixel resolution. It removes the temporary instance when it finishes.

Use shared types for cross-layer contracts and keep database access, credentials, and model clients on the server. See the [architecture overview](docs/architecture/overview.md). Add fixture coverage for a specific regression when the existing checks miss it.

Keep changes small. Describe how to reproduce the behavior and how you verified it. Report security issues privately using the [security policy](SECURITY.md). Contributions are subject to the [Code of Conduct](CODE_OF_CONDUCT.md) and the [pending licence](LICENSE-PENDING.md).
