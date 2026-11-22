import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

test('unpacked Chrome extension starts and offers self-hosted connection', async () => {
  test.skip(!process.env.AM_E2E_ARTICLE, 'The release check installs bundled Chromium.');
  const directory = resolve('extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extension = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extension}/options.html`);
    await expect(page.locator('#extension-version')).toHaveText(/^Version /);
    await expect(page.locator('#connect-form')).toBeVisible();
    await expect(page.locator('#origin')).toHaveValue('http://localhost:3000');
    await expect(page.locator('#message')).toBeHidden();
  } finally {
    await context.close();
  }
});
