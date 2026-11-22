import { createHash, randomUUID } from 'node:crypto';
import { chunkStructured } from '@/server/services/knowledge/upstream/chunker';
import type { Passage } from '@/shared/passages';

export const KNOWLEDGE_VERSION = 2;

export function contentHash(title: string, passages: Passage[]) {
  return createHash('sha256')
    .update(JSON.stringify([KNOWLEDGE_VERSION, title, passages]))
    .digest('hex');
}

export function chunksFor(passages: Passage[]) {
  const sections: string[] = [];
  const positions: { index: number; start: number; end: number }[] = [];
  let length = 0;
  for (const { index, text } of passages) {
    if (!text.trim()) continue;
    if (sections.length) length += 2;
    positions.push({ index, start: length, end: length + text.length });
    sections.push(text);
    length += text.length;
  }
  const reading = sections.join('\n\n');
  let cursor = 0;
  let firstPassage = 0;

  return chunkStructured(reading).map((chunk, ordinal) => {
    const start = reading.indexOf(chunk.content, cursor);
    if (start < 0) throw new Error('The indexed chunk could not be mapped to its source passages.');
    const end = start + chunk.content.length;
    cursor = end;

    while (positions[firstPassage].end <= start) firstPassage += 1;
    const passageIndices: number[] = [];
    for (let i = firstPassage; i < positions.length && positions[i].start < end; i += 1) {
      passageIndices.push(positions[i].index);
    }
    return {
      id: randomUUID(),
      ordinal,
      content: chunk.content,
      content_hash: chunk.contentHash,
      passageIndices,
    };
  });
}

export function normalizedTag(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
}
