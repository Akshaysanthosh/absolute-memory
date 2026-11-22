# ADR 0009 · Minimal reader and passage citations

## Scope

The local edition includes the single-column reader, basic single-colour highlights, the Highlights page, and citations in library-wide chat. Colour highlights, passage notes, and reading-assistant features are available in the hosted edition. Library cards and item details retain their short summaries and tags.

## Reading and extraction

A saved item stores sanitised HTML and a sequence of numbered passages. The HTML carries passage attributes and fragment IDs such as `#p-3`. A passage stores its exact plain text and, for timed transcript cues, its start and end in milliseconds. Knowledge chunks track all covered passage indices. A saved citation carries an item ID and the starting passage index. Library search indexes passage text and saved highlight quotes.

Mozilla Readability extracts page content. jsdom supplies the DOM it needs and the DOM used by the sanitiser, with scripting and subresource fetching disabled. DOMPurify applies a narrow allowlist for text, tables, figures and native MathML. The importer removes remote image addresses from reading HTML, rewrites HTTP(S) links, and assigns passage IDs after sanitisation. If enabled, the server fetches supported images through guarded retrieval and serves verified copies on authenticated same-origin paths. The lead image comes from Open Graph or Twitter image metadata. Extraction failures keep the original link and metadata.

## Highlights and portable data

A highlight stores the quote plus one segment per passage with UTF-16 start and end offsets. A shared highlight ID groups multi-passage selections, so creation and deletion are atomic. At creation, the server checks every segment against its current owned passage. Imports retain valid offsets or search for the quoted text, allowing whitespace differences. A quote with an unavailable or ambiguous match is preserved without an anchor.

The unreleased baseline replaces the block columns and old annotation tables. Portable version 1 carries sanitised reading HTML, passages, copied image references, highlight segments, and library chat citations. The importer sanitises restored HTML again and remaps local image addresses to the receiving item. The HTTP API, MCP tool, and CLI expose read-only highlight pagination.
