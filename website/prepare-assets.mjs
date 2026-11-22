import { copyFile, mkdir } from 'node:fs/promises';

const files = [
  'media/brand/logo-light.svg',
  'media/brand/logo-dark.svg',
  'media/brand/mark.svg',
  'media/brand/social-preview.png',
  'media/library.png',
  'media/library-dark.png',
  'media/library-search.png',
  'media/reader-light.png',
  'media/ask-citation.png',
  'media/connections-mcp.png',
  'media/library-export.png',
  'media/demo.mp4',
];

const destination = new URL('./.showcase-assets/', import.meta.url);
await mkdir(new URL('media/brand/', destination), { recursive: true });
await Promise.all(
  files.map((file) =>
    copyFile(new URL(`../docs/${file}`, import.meta.url), new URL(file, destination)),
  ),
);
