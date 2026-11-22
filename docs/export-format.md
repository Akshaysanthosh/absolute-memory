# Absolute Memory export format v1

An export is a ZIP archive of UTF-8 records and stored files. The manifest identifies the `absolute-memory-export` format, version `1`, the UTC export time, the application version, and entry counts. [JSON Schema](schemas/export-v1.schema.json)

| Path                                    | Contents                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                         | Format, version, time, application version, and counts                                                          |
| `items.jsonl`                           | Item metadata, sanitised reading HTML, numbered passages, tags, and optional media and original-file references |
| `highlights.jsonl`                      | Quote, item ID, creation time, and passage segments. Unanchored quotes have an empty segments list.             |
| `notes.jsonl`                           | TipTap document JSON and a Markdown rendering                                                                   |
| `chats.jsonl`                           | Library chat threads with messages and citations                                                                |
| `graph.json`                            | Entities, evidence, relationships, and topic overviews                                                          |
| `files/<sha256>.<ext>`                  | Original PDFs, images, and workbooks, stored once per digest and extension                                      |
| `reading-images/<item-id>/<slot>.<ext>` | Stored images referenced by an item's reading HTML or lead image                                                |
| `markdown/<slug>-<id-prefix>.md`        | Plain reading text with metadata and highlight quotes                                                           |

Each JSONL line is a complete object. The schema's `$defs` describes the record types. Passages have a zero-based `index` and `text`. Timed transcript passages also carry `startMs` and `endMs`. Highlight segments carry `passageIndex`, `start`, `end`, and the exact `text`. Offsets are UTF-16 code units with an exclusive end. A saved citation uses `itemId` and `passageIndex`.

The importer sanitises reading HTML, verifies original file sizes and digests, and checks the sizes and MIME signatures of stored reading images. It maps IDs to the receiving account, merges saves with the same canonical URL, and checks highlights against the restored passages. If it cannot find the quote uniquely, it keeps the quote without a passage link. Existing saves keep their text and original files. Pending imports return to the queue, and the worker can regenerate the search index and graph. The archive excludes passwords, sessions, API keys, and embeddings.
