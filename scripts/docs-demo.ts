import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as hold } from 'node:timers/promises';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import { articles, citationQuote, question } from './demo-content';
import { demoEmail } from './demo-data';
import { withDemo } from './demo-runtime';

const viewport = { width: 1280, height: 800 };
const output = 'docs/media';

async function movePointer(page: Page, x: number, y: number) {
  await page.evaluate(() => {
    if (document.querySelector('[data-demo-pointer]')) return;
    const svg = 'http://www.w3.org/2000/svg';
    const pointer = document.createElementNS(svg, 'svg');
    pointer.setAttribute('data-demo-pointer', '');
    pointer.setAttribute('aria-hidden', 'true');
    pointer.setAttribute('viewBox', '0 0 20 25');
    Object.assign(pointer.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '20px',
      height: '25px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transform: 'translate(-50px, -50px)',
    });
    const shape = document.createElementNS(svg, 'path');
    shape.setAttribute('d', 'M1 1 L1 19 L6 15 L11 23 L15 21 L10 13 L18 13 Z');
    shape.setAttribute('fill', '#242824');
    shape.setAttribute('stroke', '#FFFFFF');
    shape.setAttribute('stroke-width', '1.5');
    shape.setAttribute('stroke-linejoin', 'round');
    pointer.append(shape);
    document.body.append(pointer);
    addEventListener('mousemove', ({ clientX, clientY }) => {
      pointer.style.transform = `translate(${clientX}px, ${clientY}px)`;
    });
  });
  await page.mouse.move(x, y, { steps: 12 });
}

async function pointAt(element: Locator) {
  await element.scrollIntoViewIfNeeded();
  const bounds = await element.boundingBox();
  assert.ok(bounds);
  await movePointer(element.page(), bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

async function click(element: Locator) {
  await pointAt(element);
  await hold(200);
  await element.click();
}

function encode(directory: string, video: string, trim: number) {
  const render = (...args: string[]) =>
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: 'inherit',
    });
  const mp4 = resolve(directory, 'demo.mp4');
  const palette = resolve(directory, 'demo-palette.png');
  const gif = resolve(directory, 'demo.gif');
  render(
    '-ss',
    trim.toFixed(3),
    '-i',
    video,
    '-vf',
    'fps=30',
    '-c:v',
    'libx264',
    '-crf',
    '19',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4,
  );
  const gifFrames = 'fps=30,scale=960:-1:flags=lanczos';
  render('-i', mp4, '-vf', `${gifFrames},palettegen=stats_mode=diff`, '-frames:v', '1', palette);
  render(
    '-i',
    mp4,
    '-i',
    palette,
    '-filter_complex',
    `${gifFrames}[demo];[demo][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop',
    '0',
    gif,
  );
  return [mp4, gif];
}

execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
withDemo(async ({ origin, password, articleId, output: scratch }) => {
  const browser = await chromium.launch({
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
  });
  let videoPath: string;
  let trim: number;
  try {
    const context = await browser.newContext({
      baseURL: origin,
      colorScheme: 'light',
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: scratch, size: viewport },
    });
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      return route.abort('blockedbyclient');
    });
    const auth = await context.request.post('/api/auth/sign-in/email', {
      headers: { Origin: origin },
      data: { email: demoEmail, password },
    });
    assert.ok(auth.ok(), 'The demo account could not sign in.');
    await context.addInitScript(() => {
      localStorage.setItem('am-app-theme', 'light');
    });

    const page = await context.newPage();
    const start = performance.now();
    await page.goto('/library');
    const title = articles[0].title;
    const card = page.getByRole('article', { name: title, exact: true });
    await expect(card).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    trim = (performance.now() - start) / 1000;
    await movePointer(page, 447, 116);
    const pointer = page.locator('[data-demo-pointer]');
    await expect(pointer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 447, 116)');
    await expect(pointer).toBeInViewport();
    await hold(1300);
    await click(card.getByRole('button', { name: title, exact: true }));
    await click(page.getByRole('dialog').locator(`a[href="/read/${articleId}"]`));
    await expect(page.locator('.reading-heading h1')).toHaveText(title);
    await hold(1000);

    const sentence = page.getByText(citationQuote, { exact: true });
    await pointAt(sentence);
    await sentence.evaluate((element) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await hold(550);
    await click(page.getByRole('button', { name: 'Highlight', exact: true }));
    const highlighted = page.locator('mark[data-highlight]').filter({ hasText: citationQuote });
    await expect(highlighted).toBeVisible();
    await hold(1700);

    await click(page.getByRole('link', { name: 'Back to library' }));
    await click(page.getByRole('link', { name: 'Chat', exact: true }));
    const contextToggle = page.locator('.ac-context > summary');
    await click(contextToggle);
    await page.getByLabel('Saved reading').selectOption(articleId);
    await click(contextToggle);
    const prompt = page.getByRole('textbox', { name: 'Your question' });
    await click(prompt);
    await prompt.pressSequentially(question, { delay: 27 });
    await click(page.getByRole('button', { name: /^send/i }));
    const citation = page.getByText('The sensor above the').locator('a[href*="#p-"]');
    await expect(citation).toBeVisible();
    await hold(2600);

    const href = new URL((await citation.getAttribute('href'))!, origin);
    await click(citation);
    await expect(page).toHaveURL(href.href);
    const passage = page.locator(href.hash);
    await expect(passage).toBeInViewport();
    await expect(passage).toContainText(citationQuote);
    await expect(passage.locator('mark')).toContainText(citationQuote);
    await movePointer(page, 885, 670);
    await hold(2250);
    const video = page.video()!;
    await context.close();
    videoPath = await video.path();
  } finally {
    await browser.close();
  }

  const [mp4, gif] = encode(scratch, videoPath, trim);
  assert.ok((await stat(gif)).size < 8_000_000, 'The demo GIF exceeds 8 MB.');
  const duration = Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4],
      { encoding: 'utf8' },
    ),
  );
  assert.ok(duration > 0 && duration < 25, 'The demo recording must be shorter than 25 seconds.');
  await mkdir(output, { recursive: true });
  for (const [input, name] of [
    [mp4, 'demo.mp4'],
    [gif, 'demo.gif'],
  ]) {
    const pending = resolve(output, `.${name}.tmp`);
    await copyFile(input, pending);
    await rename(pending, resolve(output, name));
  }
  console.log(`Captured a ${duration.toFixed(2)}s demo at 30 fps.`);
}, false).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
