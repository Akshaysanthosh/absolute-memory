/** Better Auth uses this destination only when OAuth creates a new user. */
export function newUserCallback(returnTo: string) {
  const origin = 'https://example.invalid',
    url = new URL(returnTo, origin);
  if (url.origin !== origin || !returnTo.startsWith('/') || returnTo.startsWith('//'))
    return '/library?signup=complete';
  url.searchParams.set('signup', 'complete');
  return url.pathname + url.search + url.hash;
}
