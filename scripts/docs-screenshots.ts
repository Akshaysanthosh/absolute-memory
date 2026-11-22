import { cp, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withDemo } from './demo-runtime';
import { captureScreenshots } from './screenshot-pages';

withDemo(async (demo) => {
  const files = await captureScreenshots(demo);
  await mkdir('docs/media', { recursive: true });
  for (const file of files) {
    // The temp directory may be on a different volume from the checkout.
    const pendingFile = resolve('docs/media', `.${file}.tmp`);
    await cp(resolve(demo.output, file), pendingFile);
    await rename(pendingFile, resolve('docs/media', file));
  }
  console.log(`Captured ${files.length} production screenshots.`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
