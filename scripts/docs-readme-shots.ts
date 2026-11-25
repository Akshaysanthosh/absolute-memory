import { cp, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { transcriptTitle } from './demo-content';
import { demoEmail } from './demo-data';
import { withDemo } from './demo-runtime';

// Extra README image: a podcast transcript in the reader, with a play button on each passage.
const shot = { animations: 'disabled', caret: 'hide', scale: 'css' } as const;

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
  await page.mouse.move(0, 0);
}

withDemo(async ({ origin, password, output }) => {
  const browser = await chromium.launch({
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
  });
  const files: string[] = [];
  try {
    const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1280, height: 820 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const signIn = await context.request.post('/api/auth/sign-in/email', {
      headers: { Origin: origin },
      data: { email: demoEmail, password },
    });
    if (!signIn.ok()) throw new Error('The demo account could not sign in.');
    await context.addInitScript(() => {
      localStorage.setItem('am-app-theme', 'dark');
      localStorage.setItem('absolute-memory.reading', JSON.stringify({ theme: 'dark' }));
    });
    const page = await context.newPage();

    await page.goto('/library');
    await page.getByRole('button', { name: transcriptTitle, exact: true }).first().click();
    await page.getByRole('link', { name: 'Open transcript' }).click();
    await expect(page).toHaveURL(/\/(media|read)\//);
    await expect(page.getByText(transcriptTitle).first()).toBeVisible();
    await page.waitForTimeout(1000);
    await settle(page);
    await page.screenshot({ ...shot, path: resolve(output, 'reader-podcast.png') });
    files.push('reader-podcast.png');
  } finally {
    await browser.close();
  }
  await mkdir('docs/media', { recursive: true });
  for (const file of files) {
    const pending = resolve('docs/media', `.${file}.tmp`);
    await cp(resolve(output, file), pending);
    await rename(pending, resolve('docs/media', file));
  }
  console.log(`Captured ${files.length} README screenshots.`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
