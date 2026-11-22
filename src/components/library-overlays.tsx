'use client';

import Link from 'next/link';
import type { Capabilities } from '@/shared/capabilities';
import { SetupChecklist } from './setup-checklist';
import { ContentDetailDialog } from './content-detail-dialog';
import { CaptureDialog } from './capture-dialog';
import type { LibraryWorkspaceModel } from './use-library-workspace';

export function LibraryOverlays({
  model,
  capabilities,
}: {
  model: LibraryWorkspaceModel;
  capabilities: Capabilities;
}) {
  const {
    capture,
    captureKind,
    imageItem,
    notice,
    openCapture,
    refresh,
    setCapture,
    setImageItem,
    setNotice,
    setRecentSave,
  } = model;
  return (
    <>
      {!capabilities.ai && (
        <div className="al-recent-save">
          <p>Connect an AI provider to unlock summaries, semantic search and chat.</p>
          <Link href="/settings?section=providers">AI &amp; providers</Link>
        </div>
      )}
      {capabilities.embeddingNeedsRebuild && (
        <div className="al-recent-save" role="status">
          <p>
            Embedding settings changed. Keyword search is available while you rebuild embeddings.
          </p>
          <Link href="/settings?section=providers">Provider settings</Link>
        </div>
      )}
      <SetupChecklist onAdd={() => openCapture('article')} />
      <ContentDetailDialog
        aiEnabled={capabilities.ai}
        item={imageItem}
        onClose={() => setImageItem(null)}
      />
      <CaptureDialog
        initialKind={captureKind}
        open={capture}
        onClose={() => setCapture(false)}
        onSaving={(source) => setRecentSave({ source })}
        onSaveFailed={() => setRecentSave((current) => (current?.id ? current : null))}
        onSaved={(id) => {
          setRecentSave((current) => ({
            ...current,
            source: current?.source || 'New save',
            id,
            item: undefined,
          }));
          void refresh();
          setNotice('Saved to your library.');
        }}
      />
      {notice && (
        <div className="al-toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
