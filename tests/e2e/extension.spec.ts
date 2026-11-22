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
    const options = `chrome-extension://${new URL(worker.url()).host}/options.html`;
    // A fresh install opens the options page itself. Opening a second copy races with that
    // navigation, so wait for the page the extension opened and test it.
    const opened = () => context.pages().find((open) => open.url() === options);
    await expect.poll(() => opened()?.url(), { timeout: 15_000 }).toBe(options);
    const page = opened()!;
    await page.waitForLoadState();
    await expect(page.locator('#extension-version')).toHaveText(/^Version /);
    await expect(page.locator('#connect-form')).toBeVisible();
    await expect(page.locator('#origin')).toHaveValue('http://localhost:3000');
    await expect(page.locator('#message')).toBeHidden();
  } finally {
    await context.close();
  }
});
