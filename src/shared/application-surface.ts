/** Isolate route-specific global styles without separate browser documents. */
export function applicationSurface(path: string): 'reader' | 'modern' | 'legacy' {
  if (path.startsWith('/read/')) return 'reader';
  if (['/library', '/ask'].includes(path)) return 'modern';
  return 'legacy';
}
export const SURFACE_BOOT = `document.documentElement.dataset.surface=(${applicationSurface.toString()})(location.pathname);`;
