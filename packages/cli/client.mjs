import { z } from 'zod';

export const itemId = z.uuid();
export const itemOffset = z.number().int().min(0).max(9_999_999);
export const searchQuery = z.string().trim().min(1).max(200);
export const requestKey = z.string().regex(/^[A-Za-z0-9._-]{8,128}$/);
export const questionText = z.string().trim().min(1).max(1500);
export const pageLimit = z.number().int().min(1).max(100);
export const noteTitle = z.string().trim().min(1).max(300);
export const noteText = z.string().trim().min(1).max(100_000);
export const articleUrl = z.url({ protocol: /^https?$/ }).max(4000);

const status = z.enum(['pending', 'processing', 'ready', 'failed']);
const kind = z.enum(['article', 'note', 'pdf', 'image', 'spreadsheet']);
const saved = z.object({ id: itemId, status, duplicate: z.boolean(), statusPath: z.string() });
const saveStatus = z.object({ id: itemId, status });
const matches = z.object({
  items: z
    .array(z.object({ id: itemId, kind, title: z.string(), status, excerpt: z.string() }))
    .max(100),
  nextCursor: z.string().nullable().optional(),
});
const passageIndex = z.number().int().nonnegative();
const segment = z.object({
  passageIndex,
  start: passageIndex,
  end: passageIndex,
  text: z.string(),
});
const mark = z.object({
  id: itemId,
  itemId,
  title: z.string(),
  quote: z.string(),
  createdAt: z.string(),
  path: z.string().nullable(),
  segments: z.array(segment),
});
const marks = z.object({ highlights: z.array(mark).max(100), nextOffset: passageIndex.nullable() });
const answer = z.object({
  answer: z.string(),
  sources: z
    .array(
      z.object({
        number: z.number().int(),
        itemId,
        title: z.string(),
        passageIndex,
        quote: z.string(),
        path: z.string(),
      }),
    )
    .max(12),
  degraded: z.boolean(),
});
const item = z.object({
  id: itemId,
  kind,
  title: z.string(),
  status,
  url: z.string().nullable(),
  domain: z.string().nullable(),
  passages: z
    .array(
      z.object({
        index: passageIndex,
        text: z.string(),
        path: z.string(),
        startMs: passageIndex.optional(),
        endMs: passageIndex.optional(),
      }),
    )
    .max(12),
  nextOffset: itemOffset.nullable(),
  excerpt: z.string().optional(),
  highlights: z.array(mark).max(100).optional(),
});

class ApiError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function errorDetails(error) {
  if (error instanceof ApiError) {
    return {
      error: error.message,
      status: error.status,
      ...(error.retryAfter === null ? {} : { retryAfter: error.retryAfter }),
    };
  }
  if (error instanceof z.ZodError)
    return { error: 'Invalid input. Check the command or tool arguments.' };
  return { error: error instanceof Error ? error.message : 'Unexpected integration error.' };
}

export function integrationOrigin(value) {
  if (typeof value !== 'string') throw new Error('An app origin is required.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid Absolute Memory app origin.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Use an HTTPS app origin, or an HTTP loopback origin for development.');
  }
  return url.origin;
}

export function createLibraryClient({ baseUrl = 'http://localhost:3000', token }, fetcher = fetch) {
  const origin = integrationOrigin(baseUrl);
  if (typeof token !== 'string' || !/^am_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('Set ABSOLUTE_MEMORY_API_KEY to a personal key from Settings → API keys.');
  }

  async function send(
    path,
    { body, key, upload, filename, accept = 'application/json', timeout = 30_000 } = {},
  ) {
    const headers = { Authorization: 'Bearer ' + token, Accept: accept };
    if (body) headers['Content-Type'] = 'application/json';
    if (upload) {
      headers['Content-Type'] = 'application/octet-stream';
      headers['X-File-Name'] = encodeURIComponent(filename);
    }
    if (key) headers['Idempotency-Key'] = key;
    let response;
    try {
      response = await fetcher(origin + path, {
        method: body || upload ? 'POST' : 'GET',
        headers,
        body: upload ?? (body && JSON.stringify(body)),
        ...(upload ? { duplex: 'half' } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new Error(
        'Could not reach the Absolute Memory API. Check the app origin and try again.',
      );
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const detail =
        typeof data?.error === 'string'
          ? data.error.replaceAll(token, '[redacted]').slice(0, 512)
          : '';
      const retry = response.headers.get('Retry-After');
      throw new ApiError(
        response.status,
        detail || `Absolute Memory returned HTTP ${response.status}.`,
        retry && /^\d{1,9}$/.test(retry) ? Number(retry) : null,
      );
    }
    return response;
  }

  async function request(path, schema, options) {
    const response = await send(path, options);
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new Error('Absolute Memory returned an unexpected API response.');
    return parsed.data;
  }

  return {
    saveUrl(url) {
      return request('/api/v1/items', saved, {
        body: { kind: 'article', url: articleUrl.parse(url) },
      });
    },
    saveFile(filename, upload) {
      return request('/api/v1/files', saved, { filename, upload, timeout: 120_000 });
    },
    saveNote(title, text, key) {
      return request('/api/v1/items', saved, {
        body: { kind: 'note', title: noteTitle.parse(title), text: noteText.parse(text) },
        key: requestKey.parse(key),
      });
    },
    search(query) {
      return request(
        '/api/v1/items?' + new URLSearchParams({ q: searchQuery.parse(query) }),
        matches,
      );
    },
    read(id, offset = 0) {
      return request(`/api/v1/items/${itemId.parse(id)}?offset=${itemOffset.parse(offset)}`, item);
    },
    recent(limit = 20) {
      return request(
        '/api/v1/items?' + new URLSearchParams({ limit: String(pageLimit.parse(limit)) }),
        matches,
      );
    },
    highlights({ id, limit = 20, offset = 0 } = {}) {
      const params = new URLSearchParams({
        limit: String(pageLimit.parse(limit)),
        offset: String(itemOffset.parse(offset)),
      });
      if (id) params.set('itemId', itemId.parse(id));
      return request(`/api/v1/highlights?${params}`, marks);
    },
    ask(question, scope = {}) {
      return request('/api/v1/ask', answer, {
        body: { question: questionText.parse(question), ...scope },
        timeout: 110_000,
      });
    },
    async export() {
      const response = await send('/api/v1/export', {
        accept: 'application/zip',
        timeout: 300_000,
      });
      if (!response.body || !response.headers.get('content-type')?.startsWith('application/zip'))
        throw new Error('Expected a ZIP archive.');
      return response.body;
    },
    status(id) {
      return request('/api/v1/saves/' + itemId.parse(id), saveStatus);
    },
  };
}

/** @param {Record<string, string | undefined>} env */
export function clientConfiguration(env = process.env) {
  return {
    token: env.ABSOLUTE_MEMORY_API_KEY,
    baseUrl: env.ABSOLUTE_MEMORY_BASE_URL || 'http://localhost:3000',
  };
}
