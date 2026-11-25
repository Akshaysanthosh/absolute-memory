import { randomUUID } from 'node:crypto';
import type { Database, Queryable } from '../src/server/db';
import { finishTimedMediaItem, insertUploadedMediaItem } from '../src/server/repos/media-items';
import {
  insertUploadedMediaSource,
  insertYouTubeSource,
  saveTimedMediaSegments,
} from '../src/server/repos/media-sources';
import { insertDemoYouTubeItem } from '../src/server/repos/demo-library';
import { mediaReading } from '../src/server/services/import/transcript';

export const pdfTitle = 'Apollo 11 flight timeline';

export function demoPdf() {
  const lines = [
    pdfTitle,
    'Mission events in Coordinated Universal Time (UTC)',
    'July 16, 1969   13:32       Launch from Kennedy Space Center',
    'July 19, 1969   17:21       Lunar orbit insertion',
    'July 20, 1969   20:17:40    Eagle lands on the Moon',
    'July 21, 1969   02:56:15    First step on the lunar surface',
    'July 21, 1969   17:54       Lunar ascent',
    'July 24, 1969   16:50:35    Splashdown, Pacific Ocean',
    'Crew: Neil Armstrong, Michael Collins, Buzz Aldrin',
  ];
  const contents = `BT /F 34 Tf 48 720 Td (${lines[0]}) Tj /F 16 Tf 0 -44 Td\n${lines
    .slice(1)
    .map((line) => `(${line}) Tj 0 -32 Td`)
    .join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contents)} >>\nstream\n${contents}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  const xref = Buffer.byteLength(pdf);
  return Buffer.from(
    pdf +
      `xref\n0 6\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}

export const demoCallTitle = 'Voice memo: after the LLM talk';
const memo = [
  'Two ideas from the Karpathy talk worth trying this week.',
  'First, treat the context window like working memory and give the model only the passages that matter.',
  'Second, ask it to cite every claim, so a wrong answer is easy to check against the source.',
];

async function saveTimed(
  db: Queryable,
  id: string,
  user: string,
  lines: readonly string[],
  spacing: number,
) {
  const cues = lines.map((line, index) => ({
    text: line,
    offset: index * spacing,
    duration: spacing - 1000,
  }));
  const reading = mediaReading(cues);
  const content = lines.join(' ');
  await saveTimedMediaSegments(
    db,
    id,
    user,
    JSON.stringify(cues),
    'en',
    null,
    Math.round((lines.length * spacing) / 1000),
  );
  await finishTimedMediaItem(
    db,
    id,
    user,
    JSON.stringify(reading.passages),
    content.split(/\s+/).length,
    content.slice(0, 300),
    null,
    null,
    null,
    reading.html,
  );
}

export async function seedDemoCall(db: Database, user: string) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await insertUploadedMediaItem(tx, id, user, demoCallTitle);
    await insertUploadedMediaSource(tx, id, user, 'demo:llm-memo', 'synthetic');
    await saveTimed(tx, id, user, memo, 12000);
  });
  return id;
}

/** A YouTube talk saved by URL. The passages are chapter notes, spaced across the talk. */
export async function seedDemoVideo(
  db: Database,
  user: string,
  video: { id: string; title: string; channel: string; chapters: readonly string[] },
) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await insertDemoYouTubeItem(
      tx,
      id,
      user,
      `https://www.youtube.com/watch?v=${video.id}`,
      video.title,
      video.channel,
    );
    await insertYouTubeSource(tx, id, user);
    await saveTimed(tx, id, user, video.chapters, 240000);
  });
  return id;
}
