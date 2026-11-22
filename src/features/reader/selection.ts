import type { HighlightSegment } from '@/shared/passages';

const passageSelector = '[id^="p-"][data-passage]';
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

function passageOf(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(passageSelector) ?? null;
}

function offsetIn(element: HTMLElement, node: Node, offset: number) {
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(node, offset);
  return before.toString().length;
}

function wordBounds(text: string, start: number, end: number) {
  for (const part of words.segment(text)) {
    if (!part.isWordLike) continue;
    const finish = part.index + part.segment.length;
    if (part.index < start && start < finish) start = part.index;
    if (part.index < end && end < finish) end = finish;
  }
  return { start, end };
}

export function selectedSegments(
  root: HTMLElement,
  selection: Selection | null,
): HighlightSegment[] {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return [];
  const range = selection.getRangeAt(0);
  const first = passageOf(range.startContainer);
  const last = passageOf(range.endContainer);
  if (!first || !last || !root.contains(first) || !root.contains(last)) return [];
  const begin = Number(first.dataset.passage);
  const finish = Number(last.dataset.passage);
  const startOffset = offsetIn(first, range.startContainer, range.startOffset);
  const endOffset = offsetIn(last, range.endContainer, range.endOffset);
  return Array.from(root.querySelectorAll<HTMLElement>(passageSelector)).flatMap((element) => {
    const passageIndex = Number(element.dataset.passage);
    if (passageIndex < begin || passageIndex > finish) return [];
    const text = element.textContent ?? '';
    const start = passageIndex === begin ? startOffset : 0;
    const end = passageIndex === finish ? endOffset : text.length;
    if (start >= end) return [];
    const snapped = wordBounds(text, start, end);
    const quote = text.slice(snapped.start, snapped.end);
    return quote.trim() ? [{ passageIndex, ...snapped, text: quote }] : [];
  });
}

export type ReaderHighlight = { id: string; quote: string; segments: HighlightSegment[] };

export function renderMarks(root: HTMLElement, highlights: ReaderHighlight[]) {
  const byPassage = new Map<number, (HighlightSegment & { id: string })[]>();
  for (const { id, segments } of highlights) {
    for (const part of segments) {
      const entries = byPassage.get(part.passageIndex) ?? [];
      entries.push({ ...part, id });
      byPassage.set(part.passageIndex, entries);
    }
  }
  const announced = new Set<string>();
  for (const element of root.querySelectorAll<HTMLElement>(passageSelector)) {
    const text = element.textContent ?? '';
    const ranges = byPassage
      .get(Number(element.dataset.passage))
      ?.filter((range) => text.slice(range.start, range.end) === range.text);
    if (!ranges?.length) continue;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    let offset = 0;
    for (const node of nodes) {
      const start = offset;
      const end = start + node.length;
      offset = end;
      const active = ranges.filter((range) => range.start < end && range.end > start);
      if (!active.length) continue;
      const cuts = [
        ...new Set([
          start,
          end,
          ...active.flatMap((range) => [Math.max(start, range.start), Math.min(end, range.end)]),
        ]),
      ].sort((a, b) => a - b);
      const fragment = document.createDocumentFragment();
      for (let i = 1; i < cuts.length; i++) {
        const part = node.data.slice(cuts[i - 1] - start, cuts[i] - start);
        const match = active.find((range) => range.start <= cuts[i - 1] && range.end >= cuts[i]);
        if (!match) {
          fragment.append(part);
          continue;
        }
        const mark = document.createElement('mark');
        mark.dataset.highlight = match.id;
        mark.textContent = part;
        if (!announced.has(match.id)) {
          mark.tabIndex = 0;
          mark.setAttribute('role', 'button');
          mark.setAttribute('aria-label', `Highlight: ${match.text}`);
          announced.add(match.id);
        }
        fragment.append(mark);
      }
      node.replaceWith(fragment);
    }
  }
}
