# Import and export

Open **Settings**, then choose **Import** or **Export**. Start an export with **Export everything**. The worker prepares a ZIP and shows a download link when it is ready. The link is available to the signed-in account for 24 hours.

To restore a ZIP, select **Absolute Memory ZIP**, choose the file, and start the import. Restoring to another account creates account-local IDs and updates saved citation links. Canonical links already in the library keep their content and receive imported tags and highlights. A finished portable import can be repeated without duplicating its items and their highlights.

| Format                                                 | Choose this file                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Browser bookmarks, Pinboard or Raindrop bookmarks HTML | Netscape-style bookmarks HTML                                                      |
| Pocket                                                 | CSV or the older HTML export                                                       |
| Instapaper                                             | CSV with exported URLs, titles, folders and selected text when present             |
| Omnivore                                               | ZIP with metadata, content and highlights, or the metadata JSON                    |
| Readwise Reader                                        | Document CSV. To include a separate Highlights CSV, put both CSV files in one ZIP. |
| Raindrop.io                                            | CSV export                                                                         |

Legacy imports use the data in the file. Links with no saved body appear as bookmarks, with original save dates and labels when supplied. Imported quotes link to a passage when the text matches uniquely. Other quotes stay in Highlights without a passage link. Imported highlight notes and colours are dropped. The worker commits legacy imports in batches of 100 and resumes at the last completed batch after an interruption.

An account can have one import and one export in progress. Uploads stream to storage. The worker expands archive entries to temporary files, applies the limits below, and removes the temporary files when the transfer finishes.

| Variable                   | Default | Limit                                  |
| -------------------------- | ------: | -------------------------------------- |
| `TRANSFER_MAX_UPLOAD_MB`   | 256 MiB | Compressed ZIP or plain-file size      |
| `TRANSFER_MAX_EXPANDED_MB` | 512 MiB | Total expanded ZIP size                |
| `TRANSFER_MAX_ENTRY_MB`    |  64 MiB | Size of an individual expanded entry   |
| `TRANSFER_MAX_ENTRIES`     | 100,000 | Entries in a ZIP                       |
| `TRANSFER_MAX_METADATA_MB` |  64 MiB | Expanded metadata or plain import data |

Leave room on the worker's temporary filesystem for the compressed upload and its expanded entries. The [export format](export-format.md) describes the ZIP schema.
