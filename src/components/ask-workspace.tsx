'use client';
import { useAppTheme } from './app-theme';
import { WorkspaceRail } from './workspace-rail';
import { LibraryHeader, LibrarySearch } from './library-header';
import { usePanelPreference } from './use-panel-preference';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { memoryTheme } from '@/shared/am-theme';
import { AppShell } from '@astryxdesign/core/AppShell';

import { SideNav } from '@astryxdesign/core/SideNav';
import { Button } from '@astryxdesign/core/Button';

import { PanelLeft, X } from 'lucide-react';
import { WorkspaceProvider } from './workspace-context';
import { LibraryChat } from './library-chat';
import { CaptureDialog } from './capture-dialog';
import { useLibrarySession } from './library-session';
export function AskWorkspace({ enabled }: { enabled: boolean }) {
  return (
    <WorkspaceProvider>
      <ChatFrame enabled={enabled} />
    </WorkspaceProvider>
  );
}
function ChatFrame({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { theme, resolved } = useAppTheme();
  const [panel, setPanel] = usePanelPreference('chat');
  const [capture, setCapture] = useState(false);
  const [query, setQuery] = useState('');
  const { refresh } = useLibrarySession();
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || document.querySelector('dialog[open]')) return;
      if (event.key === '/') {
        event.preventDefault();
        search.current?.focus();
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCapture(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const sidebar = (history: React.ReactNode) =>
    panel ? (
      <SideNav
        className="al-topic-sidebar"
        header={
          <div className="al-topics-heading">
            <h2>Your chats</h2>
            <Button
              label="Close chats"
              isIconOnly
              variant="ghost"
              icon={<X size={16} />}
              onClick={() => setPanel(false)}
            />
          </div>
        }
      >
        {history}
      </SideNav>
    ) : undefined;
  function frame(chat: React.ReactNode, history?: React.ReactNode) {
    return (
      <Theme theme={memoryTheme} mode={theme}>
        <div className="astryx-library standard-workspace ac-shell" data-mode={resolved}>
          <WorkspaceRail onAdd={() => setCapture(true)} />
          <AppShell
            variant="section"
            height="fill"
            contentPadding={0}
            sideNav={enabled ? sidebar(history) : undefined}
            topNav={
              <LibraryHeader
                search={
                  <LibrarySearch
                    ref={search}
                    value={query}
                    onChange={setQuery}
                    onSubmit={() => {
                      router.push('/library?' + new URLSearchParams({ q: query }));
                    }}
                  />
                }
                sidebarToggle={
                  enabled &&
                  !panel && (
                    <Button
                      label="Toggle chats"
                      isIconOnly
                      icon={<PanelLeft size={19} />}
                      variant="ghost"
                      onClick={() => setPanel(!panel)}
                      aria-expanded={panel}
                    />
                  )
                }
                onCapture={() => setCapture(true)}
              />
            }
          >
            {chat}
          </AppShell>
          <CaptureDialog
            open={capture}
            onClose={() => setCapture(false)}
            onSaved={() => void refresh()}
          />
        </div>
      </Theme>
    );
  }
  return enabled ? (
    <LibraryChat render={frame} />
  ) : (
    frame(
      <section className="standard-library-content">
        <h1>Ask your library</h1>
        <p>Connect an AI provider to ask questions about your saves.</p>
        <Link href="/settings?section=providers">AI &amp; providers</Link>
      </section>,
    )
  );
}
