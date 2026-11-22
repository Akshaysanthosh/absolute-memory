export type Passage = {
  index: number;
  text: string;
  startMs?: number;
  endMs?: number;
};

export type ReadingContent = {
  html: string;
  passages: Passage[];
};

export type HighlightSegment = {
  passageIndex: number;
  start: number;
  end: number;
  text: string;
};

export function passageHref(itemId: string, passageIndex?: number) {
  const page = `/read/${encodeURIComponent(itemId)}`;
  return passageIndex === undefined ? page : `${page}#p-${passageIndex}`;
}

export function validateSegments(passages: Passage[], segments: HighlightSegment[]) {
  if (segments.length === 0) return false;
  const byIndex = new Map(passages.map((passage) => [passage.index, passage.text]));
  return segments.every(({ passageIndex, start, end, text }, i) => {
    const passage = byIndex.get(passageIndex);
    return (
      (i === 0 || segments[i - 1].passageIndex + 1 === passageIndex) &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      start < end &&
      passage !== undefined &&
      end <= passage.length &&
      passage.slice(start, end) === text
    );
  });
}

function uniquePosition(text: string, quote: string) {
  const start = text.indexOf(quote);
  return start >= 0 && text.indexOf(quote, start + 1) < 0 ? start : -1;
}

function quoteOffsets(reading: string, quote: string): [number, number] | undefined {
  const exact = uniquePosition(reading, quote);
  if (exact >= 0) return [exact, exact + quote.length];

  const whitespace = /\s+/gu;
  const compactQuote = quote.replace(whitespace, ' ');
  const compact = reading.replace(whitespace, ' ');
  const start = uniquePosition(compact, compactQuote);
  if (start < 0) return undefined;
  const end = start + compactQuote.length;
  let shift = 0;
  let startShift = 0;
  for (const gap of reading.matchAll(whitespace)) {
    const position = gap.index - shift;
    if (position >= end) break;
    shift += gap[0].length - 1;
    if (position < start) startShift = shift;
  }
  return [start + startShift, end + shift];
}

export function findQuote(passages: Passage[], quote: string): HighlightSegment[] {
  const needle = quote.trim();
  if (!needle) return [];
  const reading = passages.map(({ text }) => text).join('\n');
  const offsets = quoteOffsets(reading, needle);
  if (!offsets) return [];
  const [start, end] = offsets;
  const parts: HighlightSegment[] = [];
  let offset = 0;
  for (const { index, text } of passages) {
    const from = Math.max(0, start - offset);
    const to = Math.min(text.length, end - offset);
    if (from < to)
      parts.push({ passageIndex: index, start: from, end: to, text: text.slice(from, to) });
    offset += text.length + 1;
    if (offset >= end) break;
  }
  return validateSegments(passages, parts) ? parts : [];
}
