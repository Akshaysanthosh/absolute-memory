# Reader

A saved item has sanitised reading HTML and an ordered list of passages. Each passage has a zero-based index and its exact plain text. Transcript passages also have a start and end time in milliseconds. The worker uses those passages for search and citations. Uploaded originals remain separate from reading HTML.

## From a saved URL to a page

The capture worker fetches the URL with the instance's guarded fetch service. Mozilla Readability identifies the article in a jsdom document. DOMPurify keeps a narrow set of text, table, figure, image and MathML tags. The importer assigns passage identifiers after sanitisation, then stores the HTML and passage text together. A list item or quote with nested paragraphs points to the first passage inside it. Each leaf passage has its own fragment such as `#p-3`.

The original page's standard metadata supplies missing titles, bylines, site names, dates and descriptions. When extraction fails, the saved URL and metadata remain available with a clear extraction status.

Images are drawn from Readability's result and the page's social preview metadata. The server retrieves supported images only when the instance enables remote images. The reader loads those stored copies through authenticated, same-origin routes.

## Highlights and citations

A highlight has one identifier and ordered segments. Each segment stores a passage index, UTF-16 start and end offsets, and the exact text. The server validates every segment against the saved passage. One identifier covers all segments in a multi-passage selection and deleting that highlight removes them together.

The Highlights page groups saved quotes by item. A quote imported without a reliable text match remains in the list with a link to the item. A library chat citation carries an item ID and one passage index. The reader scrolls to that fragment and briefly indicates the destination. Clicking a transcript passage seeks playback to its recorded time.

## Visual design

Source Serif 4 sets the title and article, with the app's sans serif in the controls and metadata. Two article widths cap the measure at 66 or 75 characters. The sticky bar shows the title after scrolling past the headline and tracks reading progress along its bottom edge.

The Appearance popover saves Light or Dark, text size and line width in the browser. Light is the default for new readers and for saved settings from earlier versions that used the browser preference. The Reader shares the library's Astryx theme and uses its warning colour for a single highlight style. A short keyboard help dialog lists scrolling, size, highlight and return shortcuts. The highlight action bar slides into view, and the animation is disabled when reduced motion is requested.

If extraction fails, the Reader keeps the source link visible and can restart preparation from the same page.
