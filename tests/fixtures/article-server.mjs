import { createServer } from 'node:http';

const passage = 'Quantum cabbage is the marker for this exact passage.';
const sections = [
  [
    'A baseline for the garden',
    [
      'We marked four growing beds with wooden stakes so each volunteer could record observations without confusing one row with another. The beds share the same afternoon sun, but the soil drains at different speeds.',
      'For the first week we measured how much water stayed in each bed after a light rain. The next week we compared those readings with the intervals between new leaves on the same seedlings.',
      'The notebook stayed by the entrance to the garden. Each entry began with the date, the weather, and the name of the volunteer who checked the beds that morning.',
    ],
  ],
  [
    'Watering and new growth',
    [
      'When the top layer of soil dried, we checked the soil below it before watering. Bed three stayed damp longer where it bordered the low brick wall.',
      'We compared new leaves on marked stems instead of comparing the tallest plants. A few seedlings had already grown tall indoors, so height alone could hide changes after transplanting.',
      'Several warmer nights produced more new growth than the wider differences in watering across the four beds.',
    ],
  ],
  [
    'Notes for the next planting',
    [
      'Keep the original bed labels in place until the final reading. Record any changes to shade and surface cover alongside the watering schedule.',
      passage,
      'The next planting will use the same layout with a shorter interval between soil readings. That will make the effects of brief showers easier to see.',
    ],
  ],
];
const paragraphs = sections
  .map(([heading, notes]) => `<h2>${heading}</h2>${notes.map((note) => `<p>${note}</p>`).join('')}`)
  .join('');
const article = `<!doctype html><html lang="en"><title>Garden Experiment Field Notes</title>
  <meta property="og:title" content="Garden Experiment Field Notes">
  <meta name="author" content="Riley Chen">
  <meta property="og:site_name" content="Community Garden Journal">
  <meta property="article:published_time" content="2026-06-01">
  <body><article><h1>Garden Experiment Field Notes</h1>${paragraphs}</article></body></html>`;

createServer((request, response) => {
  if (request.url !== '/article') return response.writeHead(404).end();
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(article);
}).listen(4020, process.env.FIXTURE_HOST ?? '0.0.0.0');
