export type SocialPlatform = 'Instagram' | 'TikTok' | 'Facebook' | 'X';
const X_HOSTS = ['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com'];

/** Recognize individual media/post URLs, never profiles or arbitrary lookalike hosts. */
export function socialVideoPlatform(value: string | null | undefined): SocialPlatform | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'instagram.com' && /^\/(?:[^/]+\/)?(reel|reels|p|tv)\/[\w-]+\/?$/.test(url.pathname))
    return 'Instagram';
  if (
    (host === 'tiktok.com' && /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname)) ||
    (['vm.tiktok.com', 'vt.tiktok.com'].includes(host) && /^\/[\w-]+\/?$/.test(url.pathname))
  )
    return 'TikTok';
  if (
    X_HOSTS.includes(host) &&
    (/^\/[^/]+\/status\/\d+(?:\/(?:video|photo)\/\d+)?\/?$/.test(url.pathname) ||
      /^\/i\/(?:web\/)?status\/\d+\/?$/.test(url.pathname))
  )
    return 'X';
  if (
    ['facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(host) &&
    (/^\/reel\/\d+\/?$/.test(url.pathname) ||
      /^\/[^/]+\/videos\/\d+\/?$/.test(url.pathname) ||
      (/^\/watch\/?$/.test(url.pathname) && /^\d+$/.test(url.searchParams.get('v') || '')))
  )
    return 'Facebook';
  return null;
}

/** Display identity is broader than transcript eligibility (for example Reddit posts). */
export function contentPlatform(
  value: string | null | undefined,
): SocialPlatform | 'Reddit' | 'Pinterest' | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (
      [
        'reddit.com',
        'old.reddit.com',
        'new.reddit.com',
        'np.reddit.com',
        'm.reddit.com',
        'sh.reddit.com',
        'i.reddit.com',
        'redd.it',
      ].includes(host)
    )
      return 'Reddit';
    if (['pinterest.com', 'pinterest.co.uk', 'uk.pinterest.com', 'pin.it'].includes(host))
      return 'Pinterest';
    if (host === 'instagram.com') return 'Instagram';
    if (['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(host)) return 'TikTok';
    if (['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'].includes(host))
      return 'Facebook';
    if (X_HOSTS.includes(host)) return 'X';
  } catch {}
  return null;
}
