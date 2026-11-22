import { paragraphs, plainReading } from './content';
import type { Segment } from '@/shared/media/transcript';
import type { Passage, ReadingContent } from '@/shared/passages';

export function mediaReading(
  cues: Segment[],
  description?: string | null,
  fallback: Passage[] = [],
): ReadingContent {
  const timed = cues.map(({ offset, duration, text }): Omit<Passage, 'index'> => ({
    text,
    ...(offset > 0 || duration > 0
      ? { startMs: Math.round(offset), endMs: Math.round(offset + duration) }
      : {}),
  }));
  const details = plainReading(description ?? '').passages.map(({ text }) => ({ text }));
  const passages = [...timed, ...details, ...fallback].map((passage, index) => ({
    ...passage,
    index,
  }));
  return { passages, html: paragraphs(passages) };
}
