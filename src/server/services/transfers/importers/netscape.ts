import { JSDOM } from 'jsdom';
import { labels, savedDate, textContent, type ImportEntry } from './common';

export function netscape(input: Uint8Array): ImportEntry[] {
  const dom = new JSDOM(textContent(input));
  try {
    return Array.from(dom.window.document.querySelectorAll('a[href]')).map((anchor) => ({
      url: anchor.getAttribute('href') ?? '',
      title: anchor.textContent?.trim() ?? '',
      createdAt: savedDate(anchor.getAttribute('add_date') ?? anchor.getAttribute('time_added')),
      tags: labels(anchor.getAttribute('tags') ?? undefined),
    }));
  } finally {
    dom.window.close();
  }
}
