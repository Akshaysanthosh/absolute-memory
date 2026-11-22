import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch, Headers, type Response } from 'undici';
import { getConfig } from '@/server/config';

const userAgent = 'AbsoluteMemory/0.1.0';
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export class FetchLimitError extends Error {
  constructor() {
    super('The source exceeds the download limit.');
  }
}

export function publicAddress(value: string) {
  try {
    return ipaddr.process(value).range() === 'unicast';
  } catch {
    return false;
  }
}

export function validateFetchURL(
  input: string | URL,
  allowPrivate = getConfig().ALLOW_PRIVATE_NETWORK_FETCH,
) {
  const url = new URL(input);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!allowPrivate && url.port && !['80', '443'].includes(url.port))
  ) {
    throw new Error('Use a public HTTP or HTTPS source URL.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    !allowPrivate &&
    (host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      (!host.includes('.') && !isIP(host)) ||
      (isIP(host) && !publicAddress(host)))
  ) {
    throw new Error('Private and local addresses cannot be imported.');
  }
  return url;
}

export async function resolveFetchHost(
  host: string,
  allowPrivate: boolean,
): Promise<LookupAddress[]> {
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await lookup(host, { all: true });
  if (
    !addresses.length ||
    (!allowPrivate && addresses.some((entry) => !publicAddress(entry.address)))
  ) {
    throw new Error('Private network destination blocked.');
  }
  return addresses;
}

export async function validatePublicDestination(input: string | URL) {
  const allowPrivate = getConfig().ALLOW_PRIVATE_NETWORK_FETCH;
  const url = validateFetchURL(input, allowPrivate);
  await resolveFetchHost(url.hostname.replace(/^\[|\]$/g, ''), allowPrivate);
  return url;
}

type FetchOptions = {
  accept?: string;
  headers?: RequestInit['headers'];
  method?: string;
  body?: string;
  redirect?: RequestRedirect;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  maxBytes: number | ((response: Response, url: URL) => number);
};

/** Connect only to DNS answers checked by the guard, including on every redirect. */
export async function safeFetch<T>(
  input: string | URL,
  options: FetchOptions,
  consume: (response: Response, url: URL, body: AsyncIterable<Uint8Array>) => Promise<T>,
) {
  const allowPrivate = getConfig().ALLOW_PRIVATE_NETWORK_FETCH;
  let url = validateFetchURL(input, allowPrivate);
  const agent = new Agent({
    connect: {
      lookup(hostname, settings, callback) {
        resolveFetchHost(hostname, allowPrivate).then(
          (addresses) => {
            if (settings.all) callback(null, addresses);
            else callback(null, addresses[0].address, addresses[0].family);
          },
          (error) => callback(error, [], 0),
        );
      },
    },
  });
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const headers = new Headers(options.headers);
  if (options.accept) headers.set('Accept', options.accept);
  headers.set('User-Agent', userAgent);
  let method = options.method?.toUpperCase() ?? 'GET';
  let payload = options.body;
  try {
    for (let hop = 0; hop <= 4; hop++) {
      const response = await fetch(url, {
        dispatcher: agent,
        redirect: 'manual',
        signal,
        headers,
        method,
        body: payload,
      });
      const next = response.headers.get('location');
      const redirect = redirectStatuses.has(response.status) && next;
      if (redirect && options.redirect !== 'manual') {
        await response.body?.cancel();
        if (hop === 4 || options.redirect === 'error')
          throw new Error('The source redirected too many times or uses an unsupported redirect.');
        const target = validateFetchURL(new URL(next, url), allowPrivate);
        if (target.origin !== url.origin) {
          for (const key of ['authorization', 'cookie', 'proxy-authorization']) headers.delete(key);
        }
        if (
          (response.status === 303 && method !== 'HEAD') ||
          ([301, 302].includes(response.status) && method === 'POST')
        ) {
          method = 'GET';
          payload = undefined;
          headers.delete('Content-Type');
        }
        url = target;
        continue;
      }
      const stream = response.body;
      try {
        const limit =
          typeof options.maxBytes === 'function'
            ? options.maxBytes(response, url)
            : options.maxBytes;
        async function* bounded() {
          if (Number(response.headers.get('content-length')) > limit) throw new FetchLimitError();
          if (!stream) return;
          const reader = stream.getReader();
          let bytes = 0;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) return;
              bytes += value.byteLength;
              if (bytes > limit) throw new FetchLimitError();
              yield value;
            }
          } finally {
            reader.releaseLock();
          }
        }
        return await consume(response, url, bounded());
      } finally {
        await stream?.cancel().catch(() => {});
      }
    }
    throw new Error('The source redirected too many times.');
  } finally {
    await agent.destroy();
  }
}

export async function collectBytes(body: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Fetch-compatible helper for small metadata requests. */
export const safeMetadataFetch: typeof globalThis.fetch = async (input, init) => {
  if (typeof input !== 'string' && !(input instanceof URL))
    throw new Error('Expected a metadata URL.');
  return safeFetch(
    input,
    {
      headers: init?.headers,
      method: init?.method,
      signal: init?.signal,
      redirect: init?.redirect,
      body: typeof init?.body === 'string' ? init.body : undefined,
      maxBytes: 2_000_000,
    },
    async (response, _url, body) => {
      const bytes = response.ok && response.body ? Uint8Array.from(await collectBytes(body)) : null;
      return new globalThis.Response(bytes, {
        status: response.status,
        headers: [...response.headers],
      });
    },
  );
};
