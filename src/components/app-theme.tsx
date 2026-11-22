'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { APP_THEME_KEY, parseAppTheme, type AppTheme } from '@/shared/app-theme';

type ThemeState = {
  theme: AppTheme;
  resolved: 'light' | 'dark';
  setTheme: (theme: AppTheme) => void;
};
const ThemeContext = createContext<ThemeState | null>(null);
export function AppThemeProvider({
  children,
  showAppearance = true,
}: {
  children: React.ReactNode;
  showAppearance?: boolean;
}) {
  const [theme, setPreference] = useState<AppTheme>('dark');
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    let saved = parseAppTheme(document.documentElement.getAttribute('data-app-theme'));
    try {
      saved = parseAppTheme(localStorage.getItem(APP_THEME_KEY));
    } catch {}
    setPreference(saved);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(media.matches);
    const storage = (event: StorageEvent) => {
      if (event.key !== APP_THEME_KEY && event.key !== null) return;
      const next = parseAppTheme(event.key === null ? null : event.newValue);
      document.documentElement.setAttribute('data-app-theme', next);
      setPreference(next);
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', storage);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-app-theme', theme);
  }, [theme]);
  function setTheme(next: AppTheme) {
    document.documentElement.setAttribute('data-app-theme', next);
    setPreference(next);
    try {
      localStorage.setItem(APP_THEME_KEY, next);
    } catch {
      /* Appearance still works when browser storage is unavailable. */
    }
  }
  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolved: theme === 'system' ? (systemDark ? 'dark' : 'light') : theme,
        setTheme,
      }}
    >
      {children}
      {showAppearance && <PublicAppearance />}
    </ThemeContext.Provider>
  );
}
export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('App theme requires the main app provider.');
  return value;
}
export function AppearanceSelect() {
  const { theme, setTheme } = useAppTheme();
  return (
    <label className="app-appearance">
      Appearance
      <select
        aria-label="App appearance"
        value={theme}
        onChange={(event) => setTheme(parseAppTheme(event.target.value))}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
function PublicAppearance() {
  const path = usePathname();
  if (
    ['/library', '/ask', '/graph', '/highlights', '/connections', '/settings'].some(
      (route) => path === route || path.startsWith(route + '/'),
    )
  )
    return null;
  return (
    <div className="public-appearance">
      <AppearanceSelect />
    </div>
  );
}
