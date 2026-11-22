import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { chromium, expect, type Page } from '@playwright/test';
import { articles, citationQuote, highlightQuote, question } from './demo-content';
import { demoEmail } from './demo-data';

const settings = { deviceScaleFactor: 2, colorScheme: 'light' } as const;
const screenshot = { animations: 'disabled', caret: 'hide', scale: 'device' } as const;
const filenames = [
  'library.png',
  'library-dark.png',
  'connections-mcp.png',
  'library-export.png',
  'library-search.png',
  'library-mobile.png',
  'reader-light.png',
  'reader-dark.png',
  'ask-citation.png',
  'reader-mobile.png',
];

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((image) => image.loading !== 'lazy')
        .map((image) => image.decode().catch(() => {})),
    );
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

async function chooseTheme(page: Page, value: 'Light' | 'Dark') {
  const trigger = page.getByRole('button', { name: 'Appearance', exact: true });
  await trigger.click();
  const menu = page.getByRole('dialog', { name: 'Appearance' });
  await expect(menu.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio')).toHaveCount(2);
  await menu.getByRole('radio', { name: value, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.reading-page')).toHaveAttribute('data-color', value.toLowerCase());
  await page.mouse.move(0, 0);
}

async function resetReaderView(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await expect(page.locator('.reading-heading h1')).toBeInViewport({ ratio: 1 });
}

async function verifyReader(page: Page, width: number) {
  await expect(page.getByRole('link', { name: 'Back to library' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keyboard help' })).toBeVisible();
  await expect(page.locator('.reading-heading h1')).toHaveText(articles[0].title);
  await expect(page.locator('.reading-heading h1')).toHaveCSS('font-family', /Source Serif 4/);
  await expect(page.locator('.reading-lead')).toBeVisible();
  assert.equal(
    await page.locator('.reading-lead').evaluate((image: HTMLImageElement) => image.naturalWidth),
    1320,
  );
  await expect(page.locator('mark').filter({ hasText: highlightQuote })).toBeInViewport({
    ratio: 1,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    width,
    `Horizontal overflow at ${width}px`,
  );
}

async function checkHorizontal(page: Page, width: number) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    width,
    `Horizontal overflow at ${width}px`,
  );
}

async function verifyLibrary(page: Page, titles: string[]) {
  const rail = page.getByRole('navigation', { name: 'Main navigation' });
  const topics = page.getByRole('region', { name: 'Topics' });
  const grid = page.getByRole('region', { name: 'Saved items' });
  await expect(rail.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(grid.getByRole('article')).toHaveCount(titles.length);
  await expect(topics.getByRole('button', { name: `All saved ${titles.length}` })).toBeVisible();
  const count = await grid.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
  );
  assert.equal(count, 4);
  const heights = await grid
    .getByRole('article')
    .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  assert.equal(new Set(heights).size, 1);
  await checkHorizontal(page, 1440);

  await topics.getByRole('button', { name: 'Close topics' }).click();
  await expect(topics).toBeHidden();
  await page.reload();
  await expect(topics).toBeHidden();
  await page.getByRole('button', { name: 'Open topics' }).click();
  await expect(topics).toBeVisible();
  await topics.getByRole('searchbox').fill('repair');
  const repair = topics.getByRole('button', { name: 'repair 2', exact: true });
  await repair.click();
  await expect(page.getByRole('heading', { level: 1, name: 'repair' })).toBeVisible();
  await expect(grid.getByRole('article')).toHaveCount(2);
  await topics.getByRole('button', { name: /^All saved/ }).click();
  await topics.getByRole('searchbox').clear();
  await expect(grid.getByRole('article')).toHaveCount(titles.length);

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.standard-library')).toHaveAttribute('data-mode', 'dark');
  await expect(grid.getByRole('article').first()).toHaveCSS('background-color', 'rgb(10, 10, 10)');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('.standard-library')).toHaveAttribute('data-mode', 'light');
  await page.keyboard.press('Control+/');
  await expect(page.getByRole('textbox', { name: 'Search your saved library' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function composeCitation(ask: Buffer, reader: Buffer, output: string) {
  const [left, right] = await Promise.all([loadImage(ask), loadImage(reader)]);
  const seam = 2;
  const canvas = createCanvas(left.width + seam + right.width, Math.max(left.height, right.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d6d9d3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(left, 0, 0);
  ctx.drawImage(right, left.width + seam, 0);
  await writeFile(output, canvas.toBuffer('image/png'));
}

export async function captureScreenshots({
  origin,
  password,
  articleId,
  titles,
  output,
}: {
  origin: string;
  password: string;
  articleId: string;
  titles: string[];
  output: string;
}) {
  const browser = await chromium.launch({
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
  });
  try {
    const context = await browser.newContext({
      ...settings,
      baseURL: origin,
      viewport: { width: 1440, height: 900 },
    });
    const credentials = await context.request.post('/api/auth/sign-in/email', {
      headers: { Origin: origin },
      data: { email: demoEmail, password },
    });
    assert.ok(credentials.ok(), 'The demo account could not sign in.');
    await context.addInitScript(() => {
      if (!localStorage.getItem('am-app-theme')) localStorage.setItem('am-app-theme', 'light');
    });
    const page = await context.newPage();
    const path = (name: string) => resolve(output, name);
    await page.goto('/library');
    for (const title of titles)
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await verifyLibrary(page, titles);
    const libraryCovers = page.locator('img[src*="/reading-images/"]');
    await expect(libraryCovers).toHaveCount(articles.length);
    await Promise.all(
      (await libraryCovers.all()).map((cover) =>
        cover.evaluate((image: HTMLImageElement) => image.decode()),
      ),
    );
    await settle(page);
    await page.screenshot({ ...screenshot, path: path('library.png') });
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('.standard-library')).toHaveAttribute('data-mode', 'dark');
    await page.mouse.move(0, 0);
    await settle(page);
    await page.screenshot({ ...screenshot, scale: 'css', path: path('library-dark.png') });
    await page.getByRole('button', { name: 'Switch to light mode' }).click();

    await page.setViewportSize({ width: 1024, height: 900 });
    await checkHorizontal(page, 1024);
    await expect(page.getByRole('region', { name: 'Topics' })).toBeVisible();
    await page.setViewportSize({ width: 768, height: 900 });
    await checkHorizontal(page, 768);
    await expect(page.getByRole('region', { name: 'Topics' })).toBeHidden();
    await page.getByRole('button', { name: 'Open topics' }).click();
    await expect(page.getByRole('dialog', { name: 'Topics' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Topics' })).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 1020 });
    await page.goto(`/read/${articleId}`);
    await chooseTheme(page, 'Light');
    await settle(page);
    await resetReaderView(page);
    await verifyReader(page, 1280);
    await page.screenshot({ ...screenshot, path: path('reader-light.png') });
    await chooseTheme(page, 'Dark');
    await settle(page);
    await resetReaderView(page);
    await expect(page.locator('.reading-page')).toHaveCSS('color-scheme', 'dark');
    await page.screenshot({ ...screenshot, path: path('reader-dark.png') });
    await chooseTheme(page, 'Light');

    const mobile = await browser.newContext({
      ...settings,
      baseURL: origin,
      storageState: await context.storageState(),
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await mobile.newPage();
    await phone.goto('/library');
    await expect(phone.getByRole('heading', { name: 'All saved', level: 1 })).toBeVisible();
    await expect(
      phone.getByRole('region', { name: 'Saved items' }).getByRole('article'),
    ).toHaveCount(titles.length);
    const tabs = phone.getByRole('navigation', { name: 'Main navigation' });
    await expect(tabs.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    assert.equal(
      Math.round((await tabs.boundingBox())!.y + (await tabs.boundingBox())!.height),
      812,
    );
    await checkHorizontal(phone, 375);
    await phone
      .locator('img[src*="/reading-images/"]')
      .first()
      .evaluate((image: HTMLImageElement) => image.decode());
    await settle(phone);
    await phone.screenshot({ ...screenshot, path: path('library-mobile.png') });
    await phone.getByRole('button', { name: 'Open topics' }).click();
    await expect(phone.getByRole('dialog', { name: 'Topics' })).toBeVisible();
    await phone
      .getByRole('dialog', { name: 'Topics' })
      .getByRole('button', { name: 'Close topics' })
      .click();
    await expect(phone.getByRole('dialog', { name: 'Topics' })).toBeHidden();

    await phone.evaluate(() =>
      localStorage.setItem('absolute-memory.reading', JSON.stringify({ theme: 'system' })),
    );
    await phone.goto(`/read/${articleId}`);
    await expect(phone.locator('.reading-page')).toHaveAttribute('data-color', 'light');
    await settle(phone);
    await verifyReader(phone, 375);
    await phone.screenshot({ ...screenshot, path: path('reader-mobile.png') });
    await phone.getByRole('button', { name: 'Appearance', exact: true }).click();
    await expect(phone.getByRole('dialog', { name: 'Appearance' })).toBeVisible();
    await phone.keyboard.press('Escape');
    await expect(phone.getByRole('dialog', { name: 'Appearance' })).toBeHidden();
    await phone.getByRole('button', { name: 'Keyboard help' }).click();
    await expect(phone.getByRole('dialog', { name: 'Reader keyboard shortcuts' })).toBeVisible();
    await phone.getByRole('button', { name: 'Close', exact: true }).click();
    const mark = phone.locator('mark').filter({ hasText: highlightQuote });
    await mark.evaluate((element) => {
      window.scrollBy(0, element.getBoundingClientRect().bottom - innerHeight + 18);
      (element as HTMLElement).click();
    });
    const action = phone.getByRole('complementary', { name: 'Highlight actions' });
    await expect(action.getByRole('button', { name: 'Remove highlight' })).toBeVisible();
    await expect
      .poll(async () => {
        const [bounds, dock] = await Promise.all([mark.boundingBox(), action.boundingBox()]);
        return !!bounds && !!dock && bounds.y + bounds.height <= dock.y;
      })
      .toBe(true);
    await mobile.close();

    await page.setViewportSize({ width: 960, height: 820 });
    await page.goto('/ask');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Chat' }),
    ).toHaveAttribute('aria-current', 'page');
    await checkHorizontal(page, 960);
    const contextToggle = page.locator('.ac-context > summary');
    await contextToggle.click();
    await page.getByLabel('Saved reading').selectOption(articleId);
    await contextToggle.click();
    await page.getByRole('textbox', { name: 'Your question' }).fill(question);
    await page.getByRole('button', { name: /^send/i }).click();
    const citation = page
      .getByText('The sensor above the', { exact: false })
      .locator('a[href*="#p-"]');
    await expect(citation).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('1 saved passage', { exact: true })).toBeVisible();
    await settle(page);
    const ask = await page.screenshot(screenshot);
    const href = new URL((await citation.getAttribute('href'))!, origin);
    assert.equal(href.pathname, `/read/${articleId}`);
    assert.match(href.hash, /^#p-\d+$/);

    await page.setViewportSize({ width: 768, height: 820 });
    await citation.click();
    await expect(page).toHaveURL(href.href);
    const passage = page.locator(href.hash);
    await expect(passage).toBeInViewport();
    await expect(passage).toContainText(citationQuote);
    await expect(page.locator('.reading-bar-title')).toHaveText(articles[0].title);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 768);
    assert.equal(
      await page
        .locator('.reading-bar')
        .evaluate((bar) => Math.round(bar.getBoundingClientRect().top)),
      0,
    );
    const reader = await page.screenshot(screenshot);
    await composeCitation(ask, reader, path('ask-citation.png'));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings?section=keys');
    await expect(
      page.getByRole('heading', { name: 'Personal API keys', exact: true }),
    ).toBeVisible();
    await settle(page);
    await page.screenshot({ ...screenshot, scale: 'css', path: path('connections-mcp.png') });
    await page.goto('/settings?section=export');
    await expect(page.getByRole('button', { name: 'Export everything' })).toBeVisible();
    await settle(page);
    await page.screenshot({ ...screenshot, scale: 'css', path: path('library-export.png') });

    await page.goto('/library');
    await page.getByRole('button', { name: 'repair 2', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'repair' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Saved items' }).getByRole('article'),
    ).toHaveCount(2);
    await settle(page);
    await page.screenshot({ ...screenshot, scale: 'css', path: path('library-search.png') });
    return filenames;
  } finally {
    await browser.close();
  }
}
