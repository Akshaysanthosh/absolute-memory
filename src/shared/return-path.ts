/** Accept only known internal destinations; never arbitrary redirect URLs. */
export function loginReturnPath(value: unknown): string {
  if (typeof value === 'string' && /^\/connect\/extension\?challenge=[a-f0-9]{64}$/.test(value))
    return value;
  if (typeof value !== 'string' || value.length > 512 || /[\\\u0000-\u001f\u007f]/.test(value))
    return '/library';
  const pathname = value.split(/[?#]/, 1)[0];
  if (/^\/(library|ask|graph|settings|connections|highlights)$/.test(pathname)) return value;
  if (/^\/(read|media)\/[a-f0-9-]{36}$/i.test(pathname)) return value;
  return '/library';
}

export const RETURN_PATH_HEADER = 'x-am-return-path';

export function loginPathFor(destination: unknown): string {
  const path = loginReturnPath(destination);
  return path === '/library' ? '/login' : '/login?' + new URLSearchParams({ next: path });
}
