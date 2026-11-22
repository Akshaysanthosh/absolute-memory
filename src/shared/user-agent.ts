/** "Chrome on macOS" from a user agent string; falls back to a generic label. */
export function describeAgent(agent?: string | null) {
  if (!agent) return 'Unknown browser';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /OPR\//.test(agent)
      ? 'Opera'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Chrome\//.test(agent)
          ? 'Chrome'
          : /Safari\//.test(agent)
            ? 'Safari'
            : 'Browser';
  const os = /iPhone|iPad/.test(agent)
    ? 'iOS'
    : /Android/.test(agent)
      ? 'Android'
      : /CrOS/.test(agent)
        ? 'ChromeOS'
        : /Mac OS X|Macintosh/.test(agent)
          ? 'macOS'
          : /Windows/.test(agent)
            ? 'Windows'
            : /Linux/.test(agent)
              ? 'Linux'
              : '';
  return os ? `${browser} on ${os}` : browser;
}
