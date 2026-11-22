/** Resolve the explicit save intent before making any network request. */
export function captureInputMode({
  kind,
  url,
  hasFile,
  podcast,
}: {
  kind: 'article' | 'note' | 'file';
  url: string;
  hasFile: boolean;
  podcast: boolean;
}) {
  if (kind === 'note') return 'note';
  if (hasFile && url.trim())
    throw new Error('Save one source at a time. Clear the link or remove the file first.');
  if (hasFile) return 'file';
  if (podcast || /^https:\/\/(?:podcasts\.apple\.com|open\.spotify\.com)\//i.test(url.trim()))
    return 'podcast';
  return 'article';
}
