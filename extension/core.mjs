export const DEFAULT_ORIGIN = 'http://localhost:3000';
export function appOrigin(value) {
  const u = new URL(value.trim());
  if (u.username || u.password || u.search || u.hash || !['', '/'].includes(u.pathname))
    throw new Error('Enter only your Absolute Memory app address.');
  if (
    u.protocol !== 'https:' &&
    !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))
  )
    throw new Error('Use HTTPS, or localhost for a local instance.');
  return u.origin;
}
export function hostPattern(origin) {
  const u = new URL(appOrigin(origin));
  return `${u.protocol}//${u.hostname}/*`;
}
export function articleUrl(value, origin) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error('Open an article webpage first.');
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Open a public article webpage first.');
  if (
    u.origin === origin ||
    ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
    u.hostname.endsWith('.local')
  )
    throw new Error('Open an article outside Absolute Memory, then click Save.');
  u.hash = '';
  for (const k of [...u.searchParams.keys()])
    if (k.startsWith('utm_') || ['fbclid', 'gclid'].includes(k)) u.searchParams.delete(k);
  return u.href;
}
export async function pairingProof() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  const challenge = [...hash].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { verifier, challenge };
}
export function statusLabel(item) {
  if (item.status === 'ready')
    return item.duplicate ? 'Already in your library' : 'Saved to your library';
  if (item.status === 'pending' || item.status === 'processing') return 'Preparing…';
  if (item.status === 'failed') return 'Saved, but the page could not be prepared';
  if (item.status === 'saving') return 'Saving…';
  return item.error || 'Not saved. Try again.';
}

export function usesTranscriptPipeline(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  if (
    [
      'youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'youtube-nocookie.com',
      'open.spotify.com',
      'podcasts.apple.com',
    ].includes(h)
  )
    return true;
  if (h === 'instagram.com' && /^\/(?:[^/]+\/)?(reel|reels|p|tv)\/[\w-]+\/?$/.test(u.pathname))
    return true;
  if (
    (h === 'tiktok.com' && /^\/@[^/]+\/video\/\d+\/?$/.test(u.pathname)) ||
    (['vm.tiktok.com', 'vt.tiktok.com'].includes(h) && /^\/[\w-]+\/?$/.test(u.pathname))
  )
    return true;
  if (
    ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(h) &&
    /^\/[^/]+\/status\/\d+(?:\/video\/\d+)?\/?$/.test(u.pathname)
  )
    return true;
  return (
    ['facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(h) &&
    (/^\/reel\/\d+\/?$/.test(u.pathname) ||
      /^\/[^/]+\/videos\/\d+\/?$/.test(u.pathname) ||
      (/^\/watch\/?$/.test(u.pathname) && /^\d+$/.test(u.searchParams.get('v') || '')))
  );
}
export function recoveryHint(item) {
  if (usesTranscriptPipeline(item.url))
    return 'Open the original to check access. A browser capture cannot recover missing spoken audio or an unavailable transcript. Open your library for details.';
  return 'Open the original page in Chrome. Once its content is visible, use Capture again. If it still cannot be prepared, keep the saved link or save a selected passage as a quote.';
}

export function isSocialSite(value) {
  try {
    return [
      'instagram.com',
      'x.com',
      'twitter.com',
      'mobile.twitter.com',
      'facebook.com',
      'm.facebook.com',
      'web.facebook.com',
      'reddit.com',
      'old.reddit.com',
      'new.reddit.com',
      'pinterest.com',
      'pinterest.co.uk',
      'uk.pinterest.com',
      'tiktok.com',
    ].includes(new URL(value).hostname.replace(/^www\./, ''));
  } catch {
    return false;
  }
}
