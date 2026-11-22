export const WELCOME_NOTE =
  'Add an article from your library and open it to start reading. Select a sentence and choose Highlight to save it.';

export const SAMPLE_CATALOG = [
  // The general encyclopedia article is CC BY-SA and useful for trying headings.
  {
    key: 'wiki-maps',
    title: 'Map',
    url: 'https://en.wikipedia.org/wiki/Map',
    topics: ['health', 'culture'],
  },
  // The Python Software Foundation documentation licence permits reuse and this tutorial exercises code blocks.
  {
    key: 'python-intro',
    title: 'An Informal Introduction to Python',
    url: 'https://docs.python.org/3/tutorial/introduction.html',
    topics: ['ai', 'study'],
  },
  // This W3C Recommendation carries the W3C permissive document licence and exercises long structured reading.
  {
    key: 'w3c-epub',
    title: 'EPUB 3.3',
    url: 'https://www.w3.org/TR/epub-33/',
    topics: ['ai', 'study'],
  },
  // The Blender Foundation film is CC BY 3.0 and provides a captioned video example.
  {
    key: 'sintel',
    title: 'Sintel',
    url: 'https://www.youtube.com/watch?v=eRsGyueVLvQ',
    topics: ['design'],
  },
].map((entry) => ({ ...entry, kind: 'article' as const, starter: true }));
