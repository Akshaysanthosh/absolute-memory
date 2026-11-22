// Generates the animated README hero and the "how it works" diagram in light and dark.
// Run with `node scripts/readme-art.mjs`. Output goes to docs/media/readme/.
import { mkdirSync, writeFileSync } from 'node:fs';

const themes = {
  light: {
    bg: '#FAFAF8',
    surface: '#FFFFFF',
    muted: '#F1F2EF',
    border: '#DDDFDA',
    text: '#242824',
    text2: '#626A65',
    text3: '#929A95',
    accent: '#344F48',
    accentSoft: '#E7EEEA',
    onAccent: '#FFFFFF',
    mark: '#F4D58D',
    line: '#C9DCD4',
  },
  dark: {
    bg: '#0A0A0A',
    surface: '#171717',
    muted: '#1C1C1C',
    border: '#2E2E2E',
    text: '#FAFAFA',
    text2: '#A3A3A3',
    text3: '#737373',
    accent: '#9DBDB2',
    accentSoft: '#1F2A27',
    onAccent: '#0A0A0A',
    mark: '#D9C27A',
    line: '#3D5A52',
  },
};

const sans = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const serif = `Georgia, 'Times New Roman', serif`;
const esc = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Small 20×20 line icons, drawn with the current stroke colour.
const icons = {
  article: 'M4 4h12v12H4z M7 8h6 M7 11h6 M7 14h4',
  video: 'M3 5h14v10H3z M9 8l4 2-4 2z',
  podcast: 'M10 3a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5 10a5 5 0 0 0 10 0 M10 15v3',
  pdf: 'M5 3h7l4 4v10H5z M12 3v4h4 M8 11h5 M8 14h5',
  image: 'M3 4h14v12H3z M3 13l4-4 4 4 2-2 4 4 M13 8h.01',
  audio: 'M3 10h1 M6 7v6 M9 4v12 M12 6v8 M15 8v4 M17 10h0',
  quote: 'M5 13c0-3 1-5 4-6 M11 13c0-3 1-5 4-6 M5 13h3v3H5z M11 13h3v3h-3z',
  note: 'M4 16l1-4 8-8 3 3-8 8z M12 5l3 3',
  social: 'M4 6h12v9H8l-4 3z M8 9l3 1.5L8 12z',
  box: 'M3 7l7-4 7 4v7l-7 4-7-4z M3 7l7 4 7-4 M10 11v7',
};

const sources = [
  ['article', 'Articles'],
  ['video', 'YouTube videos'],
  ['podcast', 'Podcasts'],
  ['social', 'Social videos'],
  ['pdf', 'PDFs'],
  ['image', 'Screenshots'],
  ['box', 'Pocket and Readwise'],
  ['audio', 'Voice memos'],
  ['quote', 'Browser quotes'],
  ['note', 'Notes'],
];

function icon(name, x, y, colour, scale = 1) {
  return `<path d="${icons[name]}" transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${colour}" stroke-width="${1.6 / scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function mark(x, y, size, c) {
  const s = size / 64;
  return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="11" y="10" width="10" height="44" rx="5" fill="${c.text}"/><rect x="43" y="10" width="10" height="44" rx="5" fill="${c.text}"/><circle cx="32" cy="32" r="8.5" fill="${c.accent}"/></g>`;
}

const cycle = 9; // seconds for one full loop of the hero

function fade(start, end, out = cycle - 0.4) {
  // Visible from start to out, as fractions of the loop.
  const t = (s) => (s / cycle).toFixed(3);
  return `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${t(start)};${t(end)};${t(out)};1" dur="${cycle}s" repeatCount="indefinite"/>`;
}

function hero(c, title) {
  const W = 1280;
  const H = 560;
  const chipX = 36;
  const chipW = 196;
  const chipH = 36;
  const gap = 10;
  const top = 64;
  const memX = 470;
  const memY = 70;
  const memW = 340;
  const memH = 462;
  const inY = memY + memH / 2;
  const parts = [];

  parts.push(
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="${c.bg}" stroke="${c.border}"/>`,
  );
  parts.push(
    `<text x="${chipX}" y="40" font-family="${sans}" font-size="12" letter-spacing="1.4" fill="${c.text3}">EVERYTHING YOU COME ACROSS</text>`,
    `<text x="${memX}" y="40" font-family="${sans}" font-size="12" letter-spacing="1.4" fill="${c.text3}">ONE PRIVATE MEMORY</text>`,
    `<text x="860" y="40" font-family="${sans}" font-size="12" letter-spacing="1.4" fill="${c.text3}">ANSWERS WITH RECEIPTS</text>`,
  );

  // Source chips and the paths into memory.
  sources.forEach(([kind, label], i) => {
    const y = top + i * (chipH + gap);
    const cy = y + chipH / 2;
    const pathId = `p${i}`;
    const startX = chipX + chipW;
    parts.push(
      `<path id="${pathId}" d="M${startX} ${cy} C ${startX + 120} ${cy}, ${memX - 120} ${inY}, ${memX} ${inY}" fill="none" stroke="${c.line}" stroke-width="1.2" stroke-dasharray="3 5"/>`,
    );
    parts.push(
      `<g><rect x="${chipX}" y="${y}" width="${chipW}" height="${chipH}" rx="18" fill="${c.surface}" stroke="${c.border}"/>${icon(kind, chipX + 12, y + 8, c.accent)}<text x="${chipX + 42}" y="${cy + 5}" font-family="${sans}" font-size="14" fill="${c.text}">${esc(label)}</text></g>`,
    );
    const begin = ((i * 0.45) % cycle).toFixed(2);
    parts.push(
      `<circle r="4" fill="${c.accent}" opacity="0"><animateMotion dur="1.6s" begin="${begin}s;${begin}s+${cycle}s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1"><mpath href="#${pathId}"/></animateMotion><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="1.6s" begin="${begin}s;${begin}s+${cycle}s"/></circle>`,
    );
  });

  // Memory panel.
  parts.push(
    `<rect x="${memX}" y="${memY}" width="${memW}" height="${memH}" rx="18" fill="${c.surface}" stroke="${c.border}"/>`,
    mark(memX + 18, memY + 16, 28, c),
    `<text x="${memX + 54}" y="${memY + 36}" font-family="${sans}" font-size="15" font-weight="600" fill="${c.text}">Absolute Memory</text>`,
    `<line x1="${memX}" y1="${memY + 60}" x2="${memX + memW}" y2="${memY + 60}" stroke="${c.border}"/>`,
  );
  const rows = [
    ['article', 'Article', 'A cooler roof for the library', '¶ 4'],
    ['video', 'YouTube', 'How to fix a bike chain', '3:12'],
    ['podcast', 'Podcast', 'The seed librarian', '0:09'],
    ['pdf', 'PDF', 'Roof measurement sheet', 'p. 1'],
    ['image', 'Screenshot', 'Whiteboard from Tuesday', 'text'],
  ];
  rows.forEach(([kind, type, name, where], i) => {
    const y = memY + 78 + i * 68;
    const appear = 1.4 + i * 0.5;
    const tx = memX + 56;
    const badge = memX + memW - 62;
    parts.push(
      [
        `<g opacity="0">${fade(appear, appear + 0.4)}`,
        `<rect x="${memX + 14}" y="${y}" width="${memW - 28}" height="56" rx="12" fill="${c.muted}"/>`,
        icon(kind, memX + 26, y + 18, c.accent),
        `<text x="${tx}" y="${y + 23}" font-family="${sans}" font-size="11" fill="${c.text3}">${esc(type)}</text>`,
        `<text x="${tx}" y="${y + 41}" font-family="${sans}" font-size="13" fill="${c.text}">${esc(name)}</text>`,
        `<rect x="${badge}" y="${y + 17}" width="36" height="20" rx="10" fill="${c.accentSoft}"/>`,
        `<text x="${badge + 18}" y="${y + 31}" text-anchor="middle" font-family="${sans}" font-size="10.5" fill="${c.accent}">${esc(where)}</text>`,
        '</g>',
      ].join(''),
    );
  });
  parts.push(
    `<text x="${memX + memW / 2}" y="${memY + memH - 22}" text-anchor="middle" font-family="${sans}" font-size="12" fill="${c.text3}">Saved as searchable, numbered passages</text>`,
  );

  // Ask and answer.
  const ax = 860;
  const aw = 384;
  parts.push(
    `<path id="out" d="M${memX + memW} ${inY} C ${memX + memW + 30} ${inY}, ${ax - 40} 250, ${ax} 250" fill="none" stroke="${c.line}" stroke-width="1.2" stroke-dasharray="3 5"/>`,
    `<circle r="4" fill="${c.accent}" opacity="0"><animateMotion dur="0.9s" begin="4.6s;4.6s+${cycle}s" fill="freeze"><mpath href="#out"/></animateMotion><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="0.9s" begin="4.6s;4.6s+${cycle}s"/></circle>`,
  );
  const q = 'How do borrowers return seed?';
  parts.push(
    `<g opacity="0">${fade(3.6, 4.0)}<rect x="${ax + aw - 270}" y="90" width="270" height="44" rx="22" fill="${c.accent}"/><text x="${ax + aw - 135}" y="117" text-anchor="middle" font-family="${sans}" font-size="14" fill="${c.onAccent}">${esc(q)}</text></g>`,
  );
  // Typing dots.
  parts.push(
    `<g opacity="0">${fade(4.1, 4.3, 5.4)}${[0, 1, 2]
      .map(
        (d) =>
          `<circle cx="${ax + 24 + d * 14}" cy="176" r="4" fill="${c.text3}"><animate attributeName="cy" values="176;170;176" dur="0.6s" begin="${d * 0.15}s" repeatCount="indefinite"/></circle>`,
      )
      .join('')}</g>`,
  );
  const answer = [
    'At the end of summer, borrowers drop off',
    'dry seed with a short note about the parent',
    'plant and how it grew.',
  ];
  parts.push(
    `<g opacity="0">${fade(5.5, 6.0)}<rect x="${ax}" y="156" width="${aw}" height="128" rx="16" fill="${c.surface}" stroke="${c.border}"/><text x="${ax + 18}" y="182" font-family="${sans}" font-size="11" fill="${c.text3}">Answer</text>${answer
      .map(
        (line, i) =>
          `<text x="${ax + 18}" y="${206 + i * 22}" font-family="${serif}" font-size="15.5" fill="${c.text}">${esc(line)}</text>`,
      )
      .join(
        '',
      )}<rect x="${ax + 180}" y="232" width="20" height="17" rx="5" fill="${c.accentSoft}"/><text x="${ax + 190}" y="244" text-anchor="middle" font-family="${sans}" font-size="11" font-weight="600" fill="${c.accent}">1</text></g>`,
  );
  // Source card that the citation opens.
  const quote = (y, line) =>
    `<text x="${ax + 90}" y="${y}" font-family="${serif}" font-size="14" fill="${c.text}">${esc(line)}</text>`;
  parts.push(
    [
      `<g opacity="0">${fade(6.6, 7.1)}`,
      `<rect x="${ax}" y="304" width="${aw}" height="150" rx="16" fill="${c.surface}" stroke="${c.accent}" stroke-width="1.5"/>`,
      icon('podcast', ax + 18, 322, c.accent),
      `<text x="${ax + 48}" y="337" font-family="${sans}" font-size="12" fill="${c.text2}">Podcast · A conversation with the seed librarian</text>`,
      `<rect x="${ax + 18}" y="356" width="52" height="22" rx="11" fill="${c.accentSoft}"/>`,
      `<text x="${ax + 44}" y="371" text-anchor="middle" font-family="${sans}" font-size="11.5" fill="${c.accent}">▶ 0:09</text>`,
      `<rect x="${ax + 82}" y="352" width="${aw - 100}" height="52" rx="6" fill="${c.mark}" opacity="0.55"/>`,
      quote(372, 'At the end of summer, borrowers drop'),
      quote(394, 'off dry seed with a short note…'),
      `<text x="${ax + 18}" y="432" font-family="${sans}" font-size="12" fill="${c.text3}">Citation opens the exact passage and timestamp</text>`,
      '</g>',
    ].join(''),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d"><title id="t">${esc(title)}</title><desc id="d">Articles, YouTube videos, podcasts, social videos, PDFs, screenshots, imports from Pocket and Readwise, voice memos, browser quotes and notes flow into one private memory as numbered passages. A question is answered from a podcast transcript, and the citation opens the passage at 0:09.</desc>${parts.join('')}</svg>\n`;
}

function flow(c, title) {
  const W = 1280;
  const H = 470;
  const cols = [
    {
      head: 'Capture',
      sub: 'Anything, from anywhere',
      items: [
        'Paste a link or upload a file',
        'YouTube, podcast and video links',
        'Browser extension and quotes',
        'Pocket and Readwise imports',
        'HTTP API, CLI and MCP',
      ],
    },
    {
      head: 'Understand',
      sub: 'Turned into text you can cite',
      items: [
        'Readable article text',
        'Captions or transcription',
        'Text from PDFs and images',
        'Numbered, timed passages',
        'Tags, summaries, embeddings',
      ],
    },
    {
      head: 'Remember',
      sub: 'Kept on your server',
      items: [
        'Library with topics',
        'Reader and highlights',
        'Original files kept',
        'Graph of people and ideas',
        'Lite or PostgreSQL + pgvector',
      ],
    },
    {
      head: 'Recall',
      sub: 'Find it the way you remember it',
      items: [
        'Search by words or meaning',
        'Ask with passage citations',
        'Jump to the line or minute',
        'Your AI tools via MCP',
        'Portable, documented export',
      ],
    },
  ];
  const x0 = 32;
  const colW = 280;
  const gapX = (W - x0 * 2 - colW * cols.length) / (cols.length - 1);
  const y0 = 40;
  const parts = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="${c.bg}" stroke="${c.border}"/>`,
  ];
  cols.forEach((col, i) => {
    const x = x0 + i * (colW + gapX);
    parts.push(
      `<rect x="${x}" y="${y0}" width="${colW}" height="${H - y0 * 2}" rx="18" fill="${c.surface}" stroke="${c.border}"/>`,
      `<circle cx="${x + 36}" cy="${y0 + 38}" r="16" fill="${c.accentSoft}"/><text x="${x + 36}" y="${y0 + 43}" text-anchor="middle" font-family="${sans}" font-size="14" font-weight="700" fill="${c.accent}">${i + 1}</text>`,
      `<text x="${x + 62}" y="${y0 + 36}" font-family="${serif}" font-size="21" fill="${c.text}">${esc(col.head)}</text>`,
      `<text x="${x + 62}" y="${y0 + 56}" font-family="${sans}" font-size="12" fill="${c.text3}">${esc(col.sub)}</text>`,
      `<line x1="${x + 20}" y1="${y0 + 78}" x2="${x + colW - 20}" y2="${y0 + 78}" stroke="${c.border}"/>`,
    );
    col.items.forEach((item, j) => {
      const y = y0 + 112 + j * 58;
      parts.push(
        `<rect x="${x + 20}" y="${y - 22}" width="${colW - 40}" height="40" rx="10" fill="${c.muted}"/>`,
        `<circle cx="${x + 38}" cy="${y - 2}" r="3.5" fill="${c.accent}"/>`,
        `<text x="${x + 52}" y="${y + 3}" font-family="${sans}" font-size="13.5" fill="${c.text}">${esc(item)}</text>`,
      );
    });
    if (i < cols.length - 1) {
      const ax = x + colW + 4;
      const ay = H / 2;
      parts.push(
        `<path d="M${ax} ${ay} h${gapX - 14}" stroke="${c.accent}" stroke-width="1.6"/><path d="M${ax + gapX - 16} ${ay - 5} l6 5 -6 5" fill="none" stroke="${c.accent}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<circle cx="${ax}" cy="${ay}" r="3" fill="${c.accent}" opacity="0"><animate attributeName="cx" values="${ax};${ax + gapX - 14}" dur="1.6s" begin="${i * 0.4}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${i * 0.4}s" repeatCount="indefinite"/></circle>`,
      );
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d"><title id="t">${esc(title)}</title><desc id="d">Four stages: capture anything; understand it as readable text, transcripts and numbered passages; remember it on your server; recall it by search, cited answers and MCP.</desc>${parts.join('')}</svg>\n`;
}

mkdirSync('docs/media/readme', { recursive: true });
for (const [name, c] of Object.entries(themes)) {
  writeFileSync(
    `docs/media/readme/hero-${name}.svg`,
    hero(c, 'Everything you come across, in one memory'),
  );
  writeFileSync(`docs/media/readme/how-it-works-${name}.svg`, flow(c, 'How Absolute Memory works'));
}
console.log('Wrote README art to docs/media/readme/.');
