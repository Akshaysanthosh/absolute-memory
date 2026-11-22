import { parse } from 'csv-parse/sync';
import { HttpError } from '@/server/auth/http';

export type ImportHighlight = { quote: string; createdAt?: string };
export type ImportEntry = {
  url: string;
  title: string;
  createdAt?: string;
  tags?: string[];
  archived?: boolean;
  favorite?: boolean;
  text?: string;
  highlights?: ImportHighlight[];
};
export type CsvRow = Record<string, string>;

export function readCsv(input: Uint8Array | string): CsvRow[] {
  try {
    return parse(typeof input === 'string' ? input : Buffer.from(input), {
      bom: true,
      columns: (headers: string[]) =>
        headers.map((key) => key.toLowerCase().replace(/[^a-z\d]/g, '')),
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: 300_000,
    });
  } catch {
    throw new HttpError(422, 'This CSV file could not be read.');
  }
}

export function labels(value?: string) {
  if (!value) return [];
  return value
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function savedDate(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!text) return undefined;
  const number = /^\d{9,13}$/.test(text) ? Number(text) * (text.length > 10 ? 1 : 1000) : null;
  const date = new Date(number ?? text);
  return !Number.isNaN(date.valueOf()) &&
    date.getUTCFullYear() >= 1 &&
    date.getUTCFullYear() <= 9999
    ? date.toISOString()
    : undefined;
}

export const textContent = (input: Uint8Array) =>
  Buffer.from(input)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
