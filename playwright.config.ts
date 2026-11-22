import { defineConfig } from '@playwright/test';

const externalUrl = process.env.APP_E2E_URL;
const withAi = process.env.AM_E2E_AI === '1';
const providerUrl = 'http://127.0.0.1:4010/v1';
const baseURL = externalUrl ?? 'http://127.0.0.1:3210';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 140_000,
  use: {
    baseURL,
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
    trace: 'retain-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : [
        ...(withAi
          ? [
              { command: 'npm run dev:mock', port: 4010 },
              {
                command: 'node tests/fixtures/article-server.mjs',
                url: 'http://127.0.0.1:4020/article',
                env: { FIXTURE_HOST: '127.0.0.1' },
              },
            ]
          : []),
        {
          command:
            'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3210',
          url: baseURL + '/api/health',
          timeout: 90_000,
          reuseExistingServer: false,
          env: {
            NEXT_TELEMETRY_DISABLED: '1',
            AM_TEST_DB: 'memory',
            APP_URL: baseURL,
            AUTH_SECRET: 'local-e2e-only-test-secret-absolute-memory',
            ALLOW_SIGNUP: 'false',
            ...(withAi
              ? {
                  ALLOW_PRIVATE_NETWORK_FETCH: 'true',
                  AI_BASE_URL: providerUrl,
                  AI_MODEL: 'fixture',
                  EMBEDDINGS_MODEL: 'fixture',
                  EMBEDDINGS_DIMENSIONS: '8',
                }
              : {}),
          },
        },
      ],
});
