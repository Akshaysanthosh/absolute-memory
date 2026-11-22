import { getConfig } from '@/server/config';

const levels = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof levels)[number];
const errorKinds = new Set([
  'AbortError',
  'TimeoutError',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ArticleImportError',
  'StructuredOutputError',
  'StorageError',
  'HttpError',
]);

export function redactError(error: unknown) {
  return error instanceof Error && errorKinds.has(error.name) ? error.name : 'Error';
}

export function logEvent(level: Level, event: string, error?: unknown) {
  if (levels.indexOf(level) < levels.indexOf(getConfig().LOG_LEVEL)) return;
  console[level](
    JSON.stringify({ level, event, ...(error === undefined ? {} : { kind: redactError(error) }) }),
  );
}
