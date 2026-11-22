'use client';

import { useEffect } from 'react';
import { useAppTheme } from './app-theme';
import { Theme } from '@astryxdesign/core/theme';
import { memoryTheme } from '@/shared/am-theme';
import type { Capabilities } from '@/shared/capabilities';
import { LibraryToolbar } from './library-toolbar';
import { LibraryCollection } from './library-collection';
import { LibraryOverlays } from './library-overlays';
import { LibraryTopics, useTopicsDialog } from './library-topics';
import { WorkspaceRail } from './workspace-rail';
import { useLibraryWorkspace } from './use-library-workspace';
import { usePanelPreference } from './use-panel-preference';

export function LibraryWorkspace({ capabilities }: { capabilities: Capabilities }) {
  const { theme, resolved } = useAppTheme();
  const model = useLibraryWorkspace(capabilities);
  const [topicsOpen, setTopicsOpen] = usePanelPreference('library');
  const drawer = useTopicsDialog();
  const { dialog } = drawer;

  useEffect(() => {
    const desktop = matchMedia('(min-width: 1024px)');
    const close = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, [dialog]);

  function openTopics() {
    if (matchMedia('(min-width: 1024px)').matches) setTopicsOpen(true);
    else drawer.open();
  }
  return (
    <Theme theme={memoryTheme} mode={theme}>
      <div
        className="astryx-library standard-workspace standard-library"
        data-mode={resolved}
        data-topics={topicsOpen ? 'open' : 'closed'}
      >
        <WorkspaceRail onAdd={() => model.openCapture('article')} />
        {topicsOpen && (
          <aside className="library-topics-panel">
            <LibraryTopics model={model} close={() => setTopicsOpen(false)} />
          </aside>
        )}
        <dialog
          ref={drawer.dialog}
          className="library-topics-drawer"
          aria-labelledby="drawer-topics-title"
        >
          <LibraryTopics model={model} drawer close={drawer.close} />
        </dialog>
        <LibraryToolbar model={model} openTopics={openTopics} />
        <main>
          <LibraryCollection model={model} />
        </main>
        <LibraryOverlays capabilities={capabilities} model={model} />
      </div>
    </Theme>
  );
}
