// Generates the animated README hero and the "how it works" diagram in light and dark.
// Run with `node scripts/readme-art.mjs`. Output goes to docs/media/readme/.
import { mkdirSync, writeFileSync } from 'node:fs';

// Colours follow the hosted Absolute Memory site: cream paper, green actions, a red accent,
// and one tint per kind of content.
const themes = {
  light: {
    bg: '#F8F7F3',
    surface: '#FFFFFF',
    border: '#E4E5DC',
    text: '#20332F',
    text2: '#5F5F5F',
    text3: '#767676',
    green: '#1A7F4B',
    onGreen: '#FFFFFF',
    red: '#E60023',
    purple: '#4B2A86',
    mark: '#FFE2EB',
    tints: {
      article: ['#DDF7EA', '#145A3A'],
      video: ['#FFE2EB', '#8A1030'],
      podcast: ['#EFE6FF', '#4B2A86'],
      social: ['#EDEDED', '#111111'],
      pdf: ['#E3EEFF', '#1D3F7A'],
      image: ['#EDF7D9', '#5A7D1F'],
      box: ['#DAFFF6', '#00403A'],
      audio: ['#EFE6FF', '#4B2A86'],
      quote: ['#DCE6F2', '#1B2A4A'],
      note: ['#F3E9D7', '#3D2F1A'],
    },
  },
  dark: {
    bg: '#0E1220',
    surface: '#14161A',
    border: '#2A2F3A',
    text: '#F8F7F3',
    text2: '#9FB3D1',
    text3: '#8A93A6',
    green: '#9BE3BD',
    onGreen: '#0E1220',
    red: '#E60023',
    purple: '#EFE6FF',
    mark: '#5A0A24',
    tints: {
      article: ['#0F3D2E', '#DDF7EA'],
      video: ['#5A0A24', '#FFE2EB'],
      podcast: ['#2B2148', '#EFE6FF'],
      social: ['#1F1F1F', '#EDEDED'],
      pdf: ['#1B2A4A', '#E3EEFF'],
      image: ['#2E3B12', '#EDF7D9'],
      box: ['#00403A', '#DAFFF6'],
      audio: ['#2B2148', '#EFE6FF'],
      quote: ['#1B2A4A', '#DCE6F2'],
      note: ['#3D2F1A', '#F3E9D7'],
    },
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
  return [
    `<g transform="translate(${x} ${y}) scale(${s})">`,
    `<rect x="11" y="10" width="10" height="44" rx="5" fill="${c.text}"/>`,
    `<rect x="43" y="10" width="10" height="44" rx="5" fill="${c.text}"/>`,
    `<circle cx="32" cy="32" r="8.5" fill="${c.red}"/></g>`,
  ].join('');
}

const cycle = 9; // seconds for one full loop of the hero

function fade(start, end, out = cycle - 0.4) {
  // Visible from start to out, in seconds within the loop.
  const t = (s) => (s / cycle).toFixed(3);
  return `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${t(start)};${t(end)};${t(out)};1" dur="${cycle}s" repeatCount="indefinite"/>`;
}

const at = (s) => (s / cycle).toFixed(3);

function grow(width, start, end) {
  // Width grows from 0 between start and end, holds, and resets at the end of the loop.
  return `<animate attributeName="width" values="0;0;${width};${width};0" keyTimes="0;${at(start)};${at(end)};${at(cycle - 0.4)};1" dur="${cycle}s" repeatCount="indefinite"/>`;
}

function flash(start) {
  // A brief outline as a passage lands in memory.
  return `<animate attributeName="stroke-opacity" values="0;0;0.9;0;0" keyTimes="0;${at(start)};${at(start + 0.2)};${at(start + 0.9)};1" dur="${cycle}s" repeatCount="indefinite"/>`;
}

function ping(start) {
  // An expanding ring around the citation number.
  const window = `keyTimes="0;${at(start)};${at(start + 0.8)};1" dur="${cycle}s" repeatCount="indefinite"`;
  return [
    `<animate attributeName="stroke-opacity" values="0;0.9;0;0" ${window}/>`,
    `<animateTransform attributeName="transform" type="scale" additive="sum" values="1;1;1.35;1.35" ${window}/>`,
  ].join('');
}

const label = (x, text, colour) =>
  `<text x="${x}" y="40" font-family="${sans}" font-size="12" font-weight="700" letter-spacing="1.4" fill="${colour}">${text}</text>`;

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
  const parts = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="${c.bg}" stroke="${c.border}"/>`,
    label(chipX, 'EVERYTHING YOU COME ACROSS', c.red),
    label(memX, 'ONE PRIVATE MEMORY', c.green),
    label(860, 'ANSWERS WITH RECEIPTS', c.purple),
  ];

  // Source chips, each in its own colour, and the paths into memory.
  sources.forEach(([kind, name], i) => {
    const [bg, fg] = c.tints[kind];
    const y = top + i * (chipH + gap);
    const cy = y + chipH / 2;
    const startX = chipX + chipW;
    const begin = (i * 0.45).toFixed(2);
    parts.push(
      `<path id="p${i}" d="M${startX} ${cy} C ${startX + 120} ${cy}, ${memX - 120} ${inY}, ${memX} ${inY}" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="1.2" stroke-dasharray="3 5"/>`,
      `<rect x="${chipX}" y="${y}" width="${chipW}" height="${chipH}" rx="18" fill="${bg}"/>`,
      icon(kind, chipX + 12, y + 8, fg),
      `<text x="${chipX + 42}" y="${cy + 5}" font-family="${sans}" font-size="14" font-weight="600" fill="${fg}">${esc(name)}</text>`,
      [
        `<circle r="4.5" fill="${fg}" opacity="0">`,
        `<animateMotion dur="1.6s" begin="${begin}s;${begin}s+${cycle}s" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.4 0 0.2 1"><mpath href="#p${i}"/></animateMotion>`,
        `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="1.6s" begin="${begin}s;${begin}s+${cycle}s"/></circle>`,
      ].join(''),
    );
  });

  // Memory panel.
  parts.push(
    `<rect x="${memX}" y="${memY}" width="${memW}" height="${memH}" rx="18" fill="${c.surface}" stroke="${c.border}"/>`,
    mark(memX + 18, memY + 16, 28, c),
    `<text x="${memX + 54}" y="${memY + 36}" font-family="${sans}" font-size="15" font-weight="700" fill="${c.text}">Absolute Memory</text>`,
    `<line x1="${memX}" y1="${memY + 60}" x2="${memX + memW}" y2="${memY + 60}" stroke="${c.border}"/>`,
  );
  const rows = [
    ['article', 'Wikipedia', 'Apollo 11', '¶ 4'],
    ['video', 'YouTube · Stanford', 'Steve Jobs at Stanford', '¶ 2'],
    ['podcast', 'Podcast', 'We choose to go to the Moon', '8:44'],
    ['pdf', 'PDF', 'Apollo 11 flight timeline', 'p. 1'],
    ['image', 'Screenshot', 'Whiteboard from Tuesday', 'text'],
  ];
  rows.forEach(([kind, type, name, where], i) => {
    const [bg, fg] = c.tints[kind];
    const y = memY + 78 + i * 68;
    const appear = 1.4 + i * 0.5;
    const tx = memX + 56;
    const badge = memX + memW - 62;
    parts.push(
      [
        `<g opacity="0">${fade(appear, appear + 0.4)}`,
        `<rect x="${memX + 14}" y="${y}" width="${memW - 28}" height="56" rx="12" fill="${bg}" stroke="${fg}" stroke-opacity="0">${flash(appear + 0.1)}</rect>`,
        icon(kind, memX + 26, y + 18, fg),
        `<text x="${tx}" y="${y + 23}" font-family="${sans}" font-size="11" font-weight="700" fill="${fg}">${esc(type)}</text>`,
        `<text x="${tx}" y="${y + 41}" font-family="${sans}" font-size="13" fill="${c.text}">${esc(name)}</text>`,
        `<rect x="${badge}" y="${y + 17}" width="36" height="20" rx="10" fill="${c.surface}"/>`,
        `<text x="${badge + 18}" y="${y + 31}" text-anchor="middle" font-family="${sans}" font-size="10.5" font-weight="600" fill="${fg}">${esc(where)}</text>`,
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
  const [podBg, podFg] = c.tints.podcast;
  parts.push(
    `<path id="out" d="M${memX + memW} ${inY} C ${memX + memW + 30} ${inY}, ${ax - 40} 250, ${ax} 250" fill="none" stroke="${c.green}" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="3 5"/>`,
    [
      `<circle r="4.5" fill="${c.green}" opacity="0">`,
      `<animateMotion dur="0.9s" begin="4.6s;4.6s+${cycle}s" fill="freeze"><mpath href="#out"/></animateMotion>`,
      `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="0.9s" begin="4.6s;4.6s+${cycle}s"/></circle>`,
    ].join(''),
    [
      `<g opacity="0">${fade(3.4, 3.6)}`,
      `<rect x="${ax + aw - 300}" y="90" width="300" height="44" rx="22" fill="${c.green}"/>`,
      `<clipPath id="type"><rect x="${ax + aw - 282}" y="96" height="32" width="0">${grow(266, 3.6, 4.5)}</rect></clipPath>`,
      `<text clip-path="url(#type)" x="${ax + aw - 282}" y="117" font-family="${sans}" font-size="14" font-weight="600" fill="${c.onGreen}">Why did Kennedy pick the Moon?</text>`,
      '</g>',
    ].join(''),
    `<g opacity="0">${fade(4.1, 4.3, 5.4)}${[0, 1, 2]
      .map(
        (d) =>
          `<circle cx="${ax + 24 + d * 14}" cy="176" r="4" fill="${c.text3}"><animate attributeName="cy" values="176;170;176" dur="0.6s" begin="${d * 0.15}s" repeatCount="indefinite"/></circle>`,
      )
      .join('')}</g>`,
  );
  const answer = [
    'Because it was hard: the goal would',
    '“organize and measure the best of our',
    'energies and skills.”',
  ];
  parts.push(
    [
      `<g opacity="0">${fade(5.5, 5.7)}`,
      `<rect x="${ax}" y="156" width="${aw}" height="128" rx="16" fill="${c.surface}" stroke="${c.border}"/>`,
      `<text x="${ax + 18}" y="182" font-family="${sans}" font-size="11" font-weight="700" fill="${c.text3}">Answer</text>`,
      ...answer.map(
        (line, i) =>
          `<g opacity="0">${fade(5.6 + i * 0.3, 5.8 + i * 0.3)}<text x="${ax + 18}" y="${206 + i * 22}" font-family="${serif}" font-size="15.5" fill="${c.text}">${esc(line)}</text></g>`,
      ),
      `<g opacity="0">${fade(6.3, 6.45)}`,
      `<rect x="${ax + 176}" y="232" width="20" height="17" rx="5" fill="${c.red}"/>`,
      `<text x="${ax + 186}" y="244" text-anchor="middle" font-family="${sans}" font-size="11" font-weight="700" fill="#FFFFFF">1</text>`,
      `<rect x="${ax + 176}" y="232" width="20" height="17" rx="5" fill="none" stroke="${c.red}" stroke-width="2" style="transform-box:fill-box;transform-origin:center">${ping(6.5)}</rect>`,
      '</g>',
      '</g>',
    ].join(''),
  );
  // Source card that the citation opens.
  const quote = (y, line) =>
    `<text x="${ax + 96}" y="${y}" font-family="${serif}" font-size="14" fill="${c.text}">${esc(line)}</text>`;
  parts.push(
    [
      `<g opacity="0">${fade(6.7, 7.1)}`,
      `<animateTransform attributeName="transform" type="translate" values="0 14;0 14;0 0;0 0" keyTimes="0;${(6.7 / cycle).toFixed(3)};${(7.1 / cycle).toFixed(3)};1" dur="${cycle}s" repeatCount="indefinite"/>`,
      `<rect x="${ax}" y="304" width="${aw}" height="150" rx="16" fill="${c.surface}" stroke="${c.red}" stroke-width="1.5"/>`,
      icon('podcast', ax + 18, 322, podFg),
      `<text x="${ax + 48}" y="337" font-family="${sans}" font-size="12" fill="${c.text2}">Podcast · John F. Kennedy at Rice University, 1962</text>`,
      `<rect x="${ax + 18}" y="356" width="56" height="22" rx="11" fill="${podBg}"/>`,
      `<text x="${ax + 46}" y="371" text-anchor="middle" font-family="${sans}" font-size="11.5" font-weight="600" fill="${podFg}">▶ 8:44</text>`,
      `<rect x="${ax + 84}" y="352" width="${aw - 102}" height="52" rx="6" fill="${c.mark}"/>`,
      `<rect x="${ax + 84}" y="352" width="4" height="52" rx="2" fill="${c.red}"/>`,
      quote(372, 'We choose to go to the Moon in this'),
      quote(394, 'decade… because they are hard.'),
      `<rect x="${ax + 18}" y="414" width="${aw - 36}" height="3" rx="1.5" fill="${c.border}"/>`,
      `<rect x="${ax + 18}" y="414" width="0" height="3" rx="1.5" fill="${c.red}">${grow(aw - 36, 7.3, 8.5)}</rect>`,
      `<text x="${ax + 18}" y="438" font-family="${sans}" font-size="12" fill="${c.text3}">Citation opens the exact passage and plays from 8:44</text>`,
      '</g>',
    ].join(''),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d"><title id="t">${esc(title)}</title><desc id="d">Articles, YouTube videos, podcasts, social videos, PDFs, screenshots, imports from Pocket and Readwise, voice memos, browser quotes and notes flow into one private memory as numbered passages. A question about John F. Kennedy’s Moon speech is answered from its transcript, and the citation opens the passage at 8:44.</desc>${parts.join('')}</svg>\n`;
}

function flow(c, title) {
  const W = 1280;
  const H = 470;
  const cols = [
    {
      tint: 'video',
      head: 'Capture',
      sub: 'Anything, from anywhere',
      items: [
        'Paste a link or upload a file',
        'YouTube and podcast links',
        'Browser extension and quotes',
        'Pocket and Readwise imports',
        'HTTP API, CLI and MCP',
      ],
    },
    {
      tint: 'pdf',
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
      tint: 'article',
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
      tint: 'podcast',
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
    const [bg, fg] = c.tints[col.tint];
    const x = x0 + i * (colW + gapX);
    parts.push(
      `<rect x="${x}" y="${y0}" width="${colW}" height="${H - y0 * 2}" rx="18" fill="${c.surface}" stroke="${c.border}"/>`,
      `<rect x="${x}" y="${y0}" width="${colW}" height="6" rx="3" fill="${fg}"/>`,
      `<circle cx="${x + 36}" cy="${y0 + 40}" r="16" fill="${fg}"/>`,
      `<text x="${x + 36}" y="${y0 + 45}" text-anchor="middle" font-family="${sans}" font-size="14" font-weight="700" fill="${bg}">${i + 1}</text>`,
      `<text x="${x + 62}" y="${y0 + 38}" font-family="${serif}" font-size="24" fill="${c.text}">${esc(col.head)}</text>`,
      `<text x="${x + 62}" y="${y0 + 58}" font-family="${sans}" font-size="12" fill="${c.text3}">${esc(col.sub)}</text>`,
    );
    col.items.forEach((item, j) => {
      const y = y0 + 112 + j * 58;
      parts.push(
        `<rect x="${x + 14}" y="${y - 22}" width="${colW - 28}" height="40" rx="10" fill="${bg}"/>`,
        `<circle cx="${x + 28}" cy="${y - 2}" r="3.5" fill="${fg}"/>`,
        `<text x="${x + 40}" y="${y + 3}" font-family="${sans}" font-size="15.5" fill="${c.text}">${esc(item)}</text>`,
      );
    });
    if (i < cols.length - 1) {
      const ax = x + colW + 4;
      const ay = H / 2;
      parts.push(
        `<path d="M${ax} ${ay} h${gapX - 14}" stroke="${c.text3}" stroke-width="1.6"/>`,
        `<path d="M${ax + gapX - 16} ${ay - 5} l6 5 -6 5" fill="none" stroke="${c.text3}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
        [
          `<circle cx="${ax}" cy="${ay}" r="3.5" fill="${c.red}" opacity="0">`,
          `<animate attributeName="cx" values="${ax};${ax + gapX - 14}" dur="1.6s" begin="${i * 0.4}s" repeatCount="indefinite"/>`,
          `<animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${i * 0.4}s" repeatCount="indefinite"/></circle>`,
        ].join(''),
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
