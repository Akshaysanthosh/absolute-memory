import createPurifier from 'dompurify';
import { JSDOM } from 'jsdom';
import type { Passage, ReadingContent } from '@/shared/passages';

const window = new JSDOM('').window;
const purify = createPurifier(window);
const tags = [
  'article',
  'section',
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'span',
  'abbr',
  'bdi',
  'a',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'code',
  'pre',
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'figure',
  'figcaption',
  'img',
  'math',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mtext',
  'mspace',
  'ms',
  'mfrac',
  'msqrt',
  'mroot',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mfenced',
  'semantics',
];

const passageTags = 'p,h1,h2,h3,h4,h5,h6,li,dt,dd,blockquote,pre,figcaption,caption,td,th';
const whitespace = /^\s*$/u;

type ImagePosition = { slot: number; source: string };

export function webURL(input: string | null, base?: string) {
  if (!input?.trim()) return null;
  try {
    const url = new URL(input, base);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function imageSource(image: Element, base?: string) {
  for (const attribute of ['width', 'height']) {
    const declared = image.getAttribute(attribute);
    if (declared && /^\d+(?:\.\d+)?$/.test(declared) && Number(declared) < 48) return null;
  }
  const responsive = image
    .getAttribute('srcset')
    ?.split(',')
    .map((entry) => entry.trim().split(/\s+/)[0]);
  for (const candidate of [
    ...(responsive ?? []),
    image.getAttribute('data-src'),
    image.getAttribute('src'),
  ]) {
    const source = webURL(candidate, base);
    if (source) return source;
  }
  return null;
}

function separateNestedText(root: DocumentFragment) {
  for (const element of root.querySelectorAll('li,blockquote,dt,dd,td,th')) {
    if (!element.querySelector(passageTags)) continue;
    let inline: ChildNode[] = [];
    const wrapInline = () => {
      const [first] = inline;
      if (first && inline.some((node) => !whitespace.test(node.textContent ?? ''))) {
        const paragraph = element.ownerDocument.createElement('p');
        first.before(paragraph);
        paragraph.append(...inline);
      }
      inline = [];
    };
    for (const child of Array.from(element.childNodes)) {
      if (
        child.nodeType === 1 &&
        ((child as Element).matches(passageTags) || (child as Element).querySelector(passageTags))
      ) {
        wrapInline();
      } else {
        inline.push(child);
      }
    }
    wrapInline();
  }
}

function numberPassages(root: DocumentFragment) {
  separateNestedText(root);
  const passages: Passage[] = [];
  const elements = Array.from(root.querySelectorAll(passageTags));
  for (const element of elements) {
    if (element.querySelector(passageTags)) continue;
    const text = element.textContent ?? '';
    if (whitespace.test(text)) continue;
    const index = passages.length;
    element.setAttribute('data-passage', String(index));
    element.id = `p-${index}`;
    passages.push({ index, text });
  }
  for (const element of elements.reverse()) {
    if (element.hasAttribute('data-passage')) continue;
    const index = element.querySelector('[data-passage]')?.getAttribute('data-passage');
    if (index !== null && index !== undefined) element.setAttribute('data-passage', index);
  }
  return passages;
}

export function prepareContent(
  html: string,
  base?: string,
): ReadingContent & { images: ImagePosition[] } {
  const root = purify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: [
      'href',
      'src',
      'srcset',
      'data-src',
      'alt',
      'title',
      'width',
      'height',
      'colspan',
      'rowspan',
      'scope',
      'start',
      'display',
      'mathvariant',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_CONTENTS: [
      'script',
      'style',
      'form',
      'iframe',
      'svg',
      'textarea',
      'select',
      'annotation-xml',
    ],
    RETURN_DOM_FRAGMENT: true,
  });
  const images: ImagePosition[] = [];
  for (const anchor of root.querySelectorAll('a')) {
    const href = webURL(anchor.getAttribute('href'), base);
    if (!href) {
      anchor.replaceWith(...anchor.childNodes);
      continue;
    }
    anchor.setAttribute('href', href);
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  for (const image of root.querySelectorAll('img')) {
    const source = imageSource(image, base);
    if (!source) {
      image.remove();
      continue;
    }
    const slot = images.length;
    for (const attribute of ['src', 'srcset', 'data-src']) image.removeAttribute(attribute);
    image.setAttribute('data-image-slot', String(slot));
    images.push({ slot, source });
  }
  const passages = numberPassages(root);
  const wrapper = window.document.createElement('div');
  wrapper.append(root);
  return { html: wrapper.innerHTML, passages, images };
}

export function finishImages(html: string, urls: ReadonlyMap<number, string> = new Map()) {
  const wrapper = window.document.createElement('template');
  wrapper.innerHTML = html;
  for (const image of wrapper.content.querySelectorAll('img[data-image-slot]')) {
    const src = urls.get(Number(image.getAttribute('data-image-slot')));
    if (!src) {
      image.remove();
      continue;
    }
    image.removeAttribute('data-image-slot');
    image.setAttribute('src', src);
    image.setAttribute('loading', 'lazy');
  }
  return wrapper.innerHTML;
}

export function escapeText(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function plainReading(text: string): ReadingContent {
  const passages = text
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => ({ index, text: part }));
  return { passages, html: paragraphs(passages) };
}

export function paragraphs(passages: Passage[]) {
  return passages
    .map(({ index, text }) => `<p id="p-${index}" data-passage="${index}">${escapeText(text)}</p>`)
    .join('');
}

export type TextSection = { tag: 'h2' | 'p' | 'blockquote' | 'pre'; text: string };

export function textReading(sections: TextSection[]): ReadingContent {
  const html: string[] = [];
  const passages: Passage[] = [];
  for (const { tag, text } of sections) {
    if (!text.trim()) continue;
    const index = passages.length;
    passages.push({ index, text });
    html.push(`<${tag} id="p-${index}" data-passage="${index}">${escapeText(text)}</${tag}>`);
  }
  return { passages, html: html.join('') };
}
