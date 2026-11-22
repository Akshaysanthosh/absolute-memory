import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getDocumentProxy, extractText, renderPageAsImage } from 'unpdf';

const bytes = new Uint8Array(await readFile(process.argv[2]));
const pdf = await getDocumentProxy(bytes);
try {
  const { text } = await extractText(pdf, { mergePages: true });
  assert.match(text, /Dummy PDF file/);
  const rendered = new Uint8Array(
    await renderPageAsImage(pdf, 1, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: 0.5,
    }),
  );
  assert.deepEqual([...rendered.slice(0, 4)], [137, 80, 78, 71]);
  console.log('Native PDF text extraction and PNG rendering passed.');
} finally {
  await pdf.loadingTask.destroy();
}
