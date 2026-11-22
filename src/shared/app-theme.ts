export type AppTheme = 'system' | 'light' | 'dark';
export const APP_THEME_KEY = 'am-app-theme';
export function parseAppTheme(value: unknown): AppTheme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
}
// Runs only in the main app root, before paint. The reader keeps its own appearance settings.
export const APP_THEME_BOOT = `(function(){var theme='dark';try{var saved=localStorage.getItem('${APP_THEME_KEY}');if(saved==='light'||saved==='dark'||saved==='system')theme=saved;}catch(e){}document.documentElement.setAttribute('data-app-theme',theme);})();`;
