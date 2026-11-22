export const workbookMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const workbookLimits = {
  archiveBytes: 24 * 1024 * 1024,
  archiveEntries: 512,
  sheets: 40,
  rows: 50_000,
  columns: 200,
  merges: 1_000,
} as const;
