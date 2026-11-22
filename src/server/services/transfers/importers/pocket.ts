import { parseHTML } from 'linkedom';
import { labels, readCsv, savedDate, textContent, type ImportEntry } from './common';

export function pocket(input: Uint8Array): ImportEntry[] {
  const text = textContent(input);
  if (/^\s*</.test(text)) {
    const { document } = parseHTML(text);
    let archived = false;
    return Array.from(document.querySelectorAll('h1,h2,a[href]')).flatMap((element) => {
      if (element.localName !== 'a') {
        archived = /archive/i.test(element.textContent ?? '');
        return [];
      }
      return [
        {
          url: element.getAttribute('href') ?? '',
          title: element.textContent?.trim() ?? '',
          createdAt: savedDate(
            element.getAttribute('time_added') ?? element.getAttribute('add_date'),
          ),
          tags: labels(element.getAttribute('tags') ?? undefined),
          archived,
        },
      ];
    });
  }
  return readCsv(text).map((row) => ({
    url: row.url ?? row.link,
    title: row.title,
    createdAt: savedDate(row.timeadded ?? row.date),
    tags: labels(row.tags),
    archived: /archive/i.test(row.status ?? ''),
  }));
}
