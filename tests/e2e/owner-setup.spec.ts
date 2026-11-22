import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('owner setup, closed registration, and cited chat when a provider is configured', async ({
  page,
  request,
  baseURL,
}) => {
  const article =
    process.env.AM_E2E_ARTICLE ??
    (!process.env.APP_E2E_URL ? 'http://127.0.0.1:4020/article' : undefined);
  await page.goto('/library');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel('Name', { exact: true }).fill('Local Owner');
  await page.getByLabel('Email address').fill('owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('e2e-owner-password-2026');
  await page.getByLabel('Confirm password').fill('e2e-owner-password-2026');
  await page.getByRole('button', { name: 'Create owner account' }).click();
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { name: /what brings you here/i })).toBeVisible();
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page).toHaveURL(/\/library$/, { timeout: 45_000 });
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const rail = page.getByRole('navigation', { name: 'Main navigation' });
  for (const [label, path] of [
    ['Graph', '/graph'],
    ['Highlights', '/highlights'],
    ['Settings', '/settings'],
    ['Home', '/library'],
  ]) {
    await rail.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(baseURL + path);
    await expect(rail.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  const directSignup = await request.post('/api/auth/sign-up/email', {
    headers: { Origin: baseURL! },
    data: {
      name: 'Blocked registration',
      email: 'anonymous@example.test',
      password: 'blocked-password-2026',
    },
  });
  expect(directSignup.ok()).toBe(false);
  const withAi = process.env.AM_E2E_AI === '1';
  await page.goto('/settings');
  const account = page.getByRole('tab', { name: 'Account', exact: true });
  await account.focus();
  await account.press('ArrowRight');
  const providers = page.getByRole('tab', { name: 'AI & providers' });
  await expect(providers).toBeFocused();
  await expect(providers).toHaveAttribute('aria-selected', 'true');
  if (!withAi) {
    if (!page.url().endsWith('/library')) await page.goto('/library');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await navigation.getByRole('link', { name: 'Chat' }).click();
    await expect(navigation.getByRole('link', { name: 'Chat' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText(/Connect an AI provider to ask questions/)).toBeVisible();
    return;
  }

  const quote = 'Quantum cabbage is the marker for this exact passage.';
  const title = 'Garden Experiment Field Notes';
  let saved;
  if (article) {
    const setupPage = await page.request.get('/settings');
    const policy = setupPage.headers()['content-security-policy'];
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    if (process.env.APP_E2E_URL) expect(policy).not.toContain('unsafe-eval');
    expect((await page.request.get('/settings')).headers()['content-security-policy']).not.toBe(
      policy,
    );
    const remoteImage = 'https://preview.example.test/probe.svg';
    let imageRequests = 0;
    await page.route(remoteImage, async (route) => {
      imageRequests++;
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      });
    });
    const remoteImagesAllowed = process.env.ALLOW_REMOTE_IMAGES === 'true';
    const loaded = await page.evaluate(
      (url) =>
        new Promise<boolean>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = url;
        }),
      remoteImage,
    );
    expect(loaded).toBe(remoteImagesAllowed);
    expect(imageRequests).toBe(remoteImagesAllowed ? 1 : 0);
    await page.unroute(remoteImage);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add to library from navigation', exact: true }).click();
    await page.getByLabel('Content URL').fill(article);
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/capture') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    saved = await response;
  } else {
    saved = await page.request.post('/api/capture', {
      headers: { Origin: baseURL! },
      data: {
        kind: 'note',
        title: 'Citation fixture',
        text:
          Array.from(
            { length: 22 },
            (_, index) =>
              `Observation ${index + 1}. ${'This paragraph is background for an ordinary reading session. '.repeat(4)}`,
          ).join('\n\n') +
          '\n\n' +
          quote,
      },
    });
  }
  expect(saved.ok(), await saved.text()).toBe(true);
  const { id } = await saved.json();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/items/${id}/knowledge`);
        return (await response.json()).state;
      },
      { timeout: 30_000 },
    )
    .toBe('ready');
  if (article) {
    const card = page.getByRole('article', { name: title, exact: true });
    await card.getByRole('button', { name: title, exact: true }).focus();
    await expect(card.getByRole('button', { name: title, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').locator(`a[href="/read/${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/read/${id}$`));
    const passage = page.getByText(quote, { exact: true });
    await passage.scrollIntoViewIfNeeded();
    await passage.evaluate((element) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
    await expect(page.locator('mark[data-highlight]').filter({ hasText: quote })).toBeVisible();
    const passageId = await page
      .locator('mark[data-highlight]')
      .filter({ hasText: quote })
      .evaluate((mark) => mark.closest('[data-passage]')?.id);
    await page.goto('/highlights');
    const savedQuote = page.getByRole('link', { name: quote, exact: true });
    await expect(savedQuote).toHaveAttribute('href', `/read/${id}#${passageId}`);
    await savedQuote.click();
    await expect(page.locator(`#${passageId}`)).toBeInViewport();
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByRole('radio', { name: 'Light', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.reading-page')).toHaveCSS('color-scheme', 'light');
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.reading-page')).toHaveCSS('color-scheme', 'dark');
    await page.goto('/library');
    const search = page
      .getByRole('textbox', { name: 'Search your saved library' })
      .filter({ visible: true });
    await search.fill('quantum cabbage');
    await search.press('Enter');
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  } else {
    // Compile the reader before timing citation navigation in development.
    expect((await page.request.get(`/read/${id}`, { timeout: 60_000 })).ok()).toBe(true);
  }
  if (!page.url().endsWith('/library')) await page.goto('/library');
  const chatLink = rail.getByRole('link', { name: 'Chat' });
  await chatLink.click();
  await expect(chatLink).toHaveAttribute('aria-current', 'page');
  await page.getByText('Whole library', { exact: true }).click();
  await page.getByLabel('Saved reading').selectOption(id);
  await page.getByRole('textbox', { name: 'Your question' }).fill('Quantum cabbage');
  await page.getByRole('button', { name: /^send/i }).click();
  const citation = page.getByRole('link', { name: '1', exact: true });
  await expect(citation).toBeVisible({ timeout: 25_000 });
  const href = new URL((await citation.getAttribute('href'))!, baseURL);
  expect(href.pathname).toBe(`/read/${id}`);
  expect(href.hash).toMatch(/^#p-\d+$/);
  await citation.click();
  await expect(page).toHaveURL(/#p-\d+$/, { timeout: 30_000 });
  const cited = page.locator(href.hash);
  await expect(cited).toBeInViewport();
  await expect(cited).toContainText(quote);
  await expect(cited).toHaveClass(/reading-target/);
  await expect(page.getByText(quote, { exact: true })).toBeVisible();

  if (article) {
    await expect(page.locator('mark[data-highlight]').filter({ hasText: quote })).toBeVisible();
    await page.goto('/settings?section=export');
    await page.getByRole('button', { name: 'Export everything' }).click();
    const link = page.getByRole('link', { name: 'Download ZIP' });
    await expect(link).toBeVisible({ timeout: 30_000 });
    const nextDownload = page.waitForEvent('download');
    await link.click();
    const download = await nextDownload;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    expect((await readFile((await download.path())!)).subarray(0, 4)).toEqual(
      Buffer.from([80, 75, 3, 4]),
    );
    await page.getByRole('button', { name: 'Account: Local Owner' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    await page.getByLabel('Email address').fill('owner@example.test');
    await page.getByLabel('Password', { exact: true }).fill('e2e-owner-password-2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/library$/, { timeout: 30_000 });
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
});
