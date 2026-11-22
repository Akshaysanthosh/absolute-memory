'use client';
import { useCallback, useEffect, useState } from 'react';
export function usePanelPreference(page: string) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.innerWidth > 768 && localStorage.getItem(`am-panel-${page}`) !== 'closed');
    } catch {
      setOpen(window.innerWidth > 768);
    }
  }, [page]);
  const choose = useCallback(
    (value: boolean) => {
      setOpen(value);
      try {
        localStorage.setItem(`am-panel-${page}`, value ? 'open' : 'closed');
      } catch {}
    },
    [page],
  );
  return [open, choose] as const;
}
