export async function api<T = Record<string, unknown>>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  if (
    typeof window !== 'undefined' &&
    options?.method &&
    !['GET', 'HEAD'].includes(options.method.toUpperCase()) &&
    /^\/api\/(items|notes|capture)/.test(path)
  )
    window.dispatchEvent(new Event('am:library-changed'));
  return data as T;
}
export const readingMinutes = (words: number) => Math.max(1, Math.ceil(words / 230));

/** Secondary item selectors follow all server pages instead of silently truncating. */
export async function libraryOptions(
  signal?: AbortSignal,
): Promise<{ items: import('@/shared/library-options').LibraryOption[] }> {
  const items: import('@/shared/library-options').LibraryOption[] = [];
  let cursor: string | null = null;
  do {
    const page: {
      items: import('@/shared/library-options').LibraryOption[];
      nextCursor: string | null;
    } = await api('/api/library/options' + (cursor ? '?' + new URLSearchParams({ cursor }) : ''), {
      signal,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return { items };
}
