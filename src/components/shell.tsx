'use client';
import { LibraryHeader, LibrarySearch } from './library-header';
import { usePanelPreference } from './use-panel-preference';
import { Theme } from '@astryxdesign/core/theme';
import { memoryTheme } from '@/shared/am-theme';
import { useAppTheme } from './app-theme';
import { WorkspaceRail } from './workspace-rail';
import { useLibrarySession } from './library-session';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PanelLeft, X } from 'lucide-react';

import { CaptureDialog } from './capture-dialog';
import { WorkspaceProvider, useWorkspace } from './workspace-context';
import styles from './workspace-shell-styles';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = useWorkspace();
  const { refresh } = useLibrarySession();
  const [capture, setCapture] = useState(false);
  const [query, setQuery] = useState('');
  const [narrow, setNarrow] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const panelToggleRef = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = usePanelPreference('graph');
  const { theme } = useAppTheme();
  const panelVisible = pathname === '/graph' && panelOpen;
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(width < 768px)');
    const sync = () => {
      setNarrow(media.matches);
      // A desktop sidebar must not become a blocking first-use modal on mobile.
      if (media.matches) setPanelOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [setPanelOpen]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panelVisible || !panel) return;
    if (narrow) panel.querySelector<HTMLButtonElement>('button')?.focus();
    // Native bubbling is intentional: screen controls enter this panel through React portals.
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setPanelOpen(false);
        requestAnimationFrame(() => panelToggleRef.current?.focus());
      }
      if (narrow && event.key === 'Tab') {
        const controls = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,textarea,summary,[tabindex="0"]',
          ),
        ).filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    panel.addEventListener('keydown', key);
    return () => panel.removeEventListener('keydown', key);
  }, [panelVisible, narrow, pathname, setPanelOpen]);
  const closePanel = () => {
    setPanelOpen(false);
    requestAnimationFrame(() => panelToggleRef.current?.focus());
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !document.querySelector('dialog[open],[aria-modal="true"]')
      ) {
        if (event.key === '/') {
          event.preventDefault();
          searchRef.current?.focus();
        }
        if (event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setCapture(true);
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <Theme theme={memoryTheme} mode={theme}>
      <div className={`${styles.workspace} standard-workspace`} data-workspace-theme="adaptive">
        <a className={styles.skipLink} href="#workspace-content">
          Skip to content
        </a>

        <WorkspaceRail onAdd={() => setCapture(true)} />
        {panelVisible && (
          <>
            {narrow && (
              <button
                className={styles.panelBackdrop}
                tabIndex={-1}
                aria-label="Close context panel"
                onClick={closePanel}
              />
            )}
            <aside
              ref={panelRef}
              id="workspace-context"
              className={styles.contextPanel}
              role={narrow ? 'dialog' : 'complementary'}
              aria-modal={narrow || undefined}
              aria-label="Graph settings"
            >
              <div className={styles.contextHeading}>
                <h2>Graph settings</h2>
                <button
                  className={styles.iconButton}
                  aria-label="Close graph settings"
                  onClick={closePanel}
                >
                  <X size={17} />
                </button>
              </div>
              <div className={styles.contextBody} ref={workspace.setPanelRoot} />
            </aside>
          </>
        )}
        <div className={styles.workspaceHeader} inert={narrow && panelVisible}>
          <LibraryHeader
            search={
              <LibrarySearch
                ref={searchRef}
                value={query}
                onChange={setQuery}
                onSubmit={() => router.push('/library?' + new URLSearchParams({ q: query }))}
              />
            }
            sidebarToggle={
              !panelVisible &&
              pathname === '/graph' && (
                <button
                  ref={panelToggleRef}
                  className={styles.iconButton}
                  aria-label="Toggle graph settings"
                  aria-expanded={panelVisible}
                  onClick={() => setPanelOpen(!panelOpen)}
                >
                  <PanelLeft size={19} />
                </button>
              )
            }
            onCapture={() => setCapture(true)}
          />
        </div>
        <div
          className={`${styles.main} ${panelVisible ? styles.withPanel : ''}`}
          inert={narrow && panelVisible}
        >
          <main id="workspace-content" className={styles.content} tabIndex={-1}>
            {children}
          </main>
        </div>
        <CaptureDialog
          open={capture}
          onClose={() => setCapture(false)}
          onSaved={(_, duplicate) => {
            void refresh();
            setToast(duplicate ? 'Already in your library.' : 'Saved to your library.');
          }}
        />
        {toast && (
          <div className={styles.toast} role="status">
            {toast}
          </div>
        )}
      </div>
    </Theme>
  );
}
