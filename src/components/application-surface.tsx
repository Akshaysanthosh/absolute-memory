'use client';
import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { applicationSurface } from '@/shared/application-surface';
export function ApplicationSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useLayoutEffect(() => {
    document.documentElement.dataset.surface = applicationSurface(pathname);
  }, [pathname]);
  return children;
}
