import { randomUUID } from 'node:crypto';
import type { Database } from '../src/server/db';
import { finishTimedMediaItem, insertUploadedMediaItem } from '../src/server/repos/media-items';
import {
  insertUploadedMediaSource,
  saveTimedMediaSegments,
} from '../src/server/repos/media-sources';
import { mediaReading } from '../src/server/services/import/transcript';
import { createCanvas } from '@napi-rs/canvas';

const palettes = [
  ['#c5cabb', '#264737', '#5f7654', '#d7ae73'],
  ['#c9d5ce', '#29464f', '#4d7b83', '#c5a16f'],
  ['#d4d7e8', '#283248', '#5e7390', '#edbb78'],
  ['#e1cbb4', '#43374d', '#996650', '#f7d8a5'],
] as const;

export function demoCover(index: number) {
  const [sky, shade, ground, sun] = palettes[index];
  const canvas = createCanvas(1320, 490);
  const ctx = canvas.getContext('2d');
  const dusk = ctx.createLinearGradient(0, 0, 0, 490);
  dusk.addColorStop(0, sky);
  dusk.addColorStop(1, ground);
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, 1320, 490);
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(canvas.width * (0.57 - index * 0.045), 160, 78, 0, 2 * Math.PI);
  ctx.fill();
  for (let row = 0; row < 5; row++) {
    ctx.fillStyle = row % 2 === 0 ? shade : ground;
    ctx.globalAlpha = 0.61 + row * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, 490);
    for (let x = 0; x <= 1320; x += 12) {
      const wave = Math.sin(x * (0.003 + row * 0.0004) + index + row * 1.6);
      const ripple = Math.sin(x * 0.016 + row) * 9;
      ctx.lineTo(x, 226 + row * 56 + wave * (59 - row * 6) + ripple);
    }
    ctx.lineTo(1320, 490);
    ctx.fill();
  }
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = sky;
  ctx.lineWidth = 1.3;
  for (let row = 0; row < 13; row++) {
    ctx.beginPath();
    for (let x = 0; x <= 1320; x += 10) {
      ctx.lineTo(x, 293 + row * 19 + Math.sin(x * 0.004 + index + row * 0.22) * 32);
    }
    ctx.stroke();
  }
  let noise = 113 + index;
  for (let dot = 0; dot < 24000; dot++) {
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    const x = noise % 1320;
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = dot % 2 ? sky : shade;
    ctx.fillRect(x, noise % 490, 2, 1);
  }
  return canvas.toBuffer('image/png');
}

export const pdfTitle = 'Library roof measurement sheet';

export function demoPdf() {
  const lines = [
    pdfTitle,
    'North Branch Library - June field survey',
    'Record the reading at 09:00, 13:00 and 17:00.',
    'Use the same marked position for each instrument.',
    'Date       Shade       Gravel       Wind',
    'June 16    23 C        28 C         light west',
    'June 17    24 C        31 C         calm',
    'June 18    25 C        33 C         light north',
  ];
  const contents = `BT /F 20 Tf 62 725 Td (${lines[0]}) Tj /F 12 Tf 0 -30 Td\n${lines
    .slice(1)
    .map((line) => `(${line}) Tj 0 -23 Td`)
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

export const demoCallTitle = 'Seed swap planning call';
export async function seedDemoCall(db: Database, user: string) {
  const text = [
    'Put the seed swap sign beside the entrance so people know they can leave envelopes without signing up first.',
    'Let’s reserve one table for dry seeds and a second table for the packets that still need a label.',
    'We can compare the count after lunch and ask the last volunteer to record which seeds are left.',
  ];
  const cues = text.map((line, index) => ({ text: line, offset: index * 12000, duration: 11000 }));
  const reading = mediaReading(cues);
  const content = text.join(' ');
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await insertUploadedMediaItem(tx, id, user, demoCallTitle);
    await insertUploadedMediaSource(tx, id, user, 'demo:seed-swap', 'synthetic');
    await saveTimedMediaSegments(tx, id, user, JSON.stringify(cues), 'en', null, 35);
    await finishTimedMediaItem(
      tx,
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
  });
  return id;
}
