export const mediaFileExtensions = [
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'flac',
  'aac',
  'mp4',
  'mov',
  'webm',
  'mkv',
];
export const mediaFileAccept = mediaFileExtensions.map((extension) => '.' + extension).join(',');

export function isMediaFilename(name: string) {
  return mediaFileExtensions.includes(
    name
      .trim()
      .match(/\.([^.]+)$/)?.[1]
      .toLowerCase() ?? '',
  );
}
