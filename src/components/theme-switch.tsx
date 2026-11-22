'use client';
import { Button } from '@astryxdesign/core/Button';
import { Theme } from '@astryxdesign/core/theme';
import { memoryTheme } from '@/shared/am-theme';
import { Sun, Moon } from 'lucide-react';
import { useAppTheme } from './app-theme';
/** One browser-wide preference, shared by the workspace and Astryx previews. */
export function ThemeSwitch() {
  const { resolved, setTheme } = useAppTheme();
  const dark = resolved === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Theme theme={memoryTheme} mode={resolved}>
      <div className="app-theme-switch" title={label}>
        <Button
          className="app-theme-button"
          label={label}
          isIconOnly
          variant="secondary"
          icon={dark ? <Sun size={21} strokeWidth={1.7} /> : <Moon size={21} strokeWidth={1.7} />}
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        />
      </div>
    </Theme>
  );
}
