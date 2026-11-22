'use client';

import { plural } from '@/shared/plural';
import { LibraryCard } from './library-card';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { BookOpen, Library, X } from 'lucide-react';
import { itemIsReady } from '@/shared/item-readiness';
import { importStatus, articleImportFeedback } from '@/shared/import-feedback';
import { SampleBanner } from './sample-banner';
import type { LibraryWorkspaceModel } from './use-library-workspace';
import { clean } from './library-display';

export function LibraryCollection({ model }: { model: LibraryWorkspaceModel }) {
  const {
    busy,
    clear,
    error,
    items,
    loading,
    menuId,
    mutate,
    recentSave,
    recentSaveCard,
    refresh,
    savedItem,
    search,
    session,
    setImageItem,
    setMenuId,
    setRecentSave,
    title,
    topic,
    type,
    filter,
  } = model;
  const filtered = Boolean(search || topic || type !== 'All types' || filter !== 'all');
  const samples = items.filter(({ sample_key }) => sample_key).length;
  return (
    <div className="standard-library-content">
      <div className="library-scope-heading">
        <h1>{title}</h1>
        <span>{plural(session.total, 'item')} · newest first</span>
      </div>
      {filtered && <Button label="Clear filters" size="sm" variant="ghost" onClick={clear} />}
      {recentSave && (
        <section ref={recentSaveCard} className="al-recent-save" aria-label="Recent save">
          <div role="status">
            <strong>{savedItem ? clean(savedItem.title) : recentSave.source}</strong>
            <p>{savedItem ? importStatus(savedItem) : recentSave.id ? 'Preparing…' : 'Saving…'}</p>
          </div>
          {savedItem?.status === 'failed' && (
            <>
              <p>{savedItem.error || 'This save needs attention.'}</p>
              {articleImportFeedback(savedItem.error).retry && (
                <Button
                  label="Retry import"
                  size="sm"
                  onClick={() => void mutate(savedItem, 'retry')}
                />
              )}
              {articleImportFeedback(savedItem.error).chrome && (
                <a href="/settings?section=extension">Save the loaded page with Chrome</a>
              )}
              {(savedItem.url || savedItem.media_url) && (
                <a
                  href={savedItem.url || savedItem.media_url || ''}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open original
                </a>
              )}
            </>
          )}
          {savedItem && itemIsReady(savedItem) && (
            <Button label="Open saved item" size="sm" onClick={() => setImageItem(savedItem)} />
          )}
          {recentSave.id && (
            <Button
              label="Dismiss save status"
              icon={<X size={16} />}
              isIconOnly
              variant="ghost"
              size="sm"
              onClick={() => setRecentSave(null)}
            />
          )}
        </section>
      )}
      {error && (
        <div role="alert" className="al-error">
          {error}
          <Button label="Try again" onClick={() => void refresh()} />
        </div>
      )}
      {!loading && (session.searching || session.updating) && (
        <p className="al-updating" role="status">
          {search ? 'Searching…' : 'Updating…'}
        </p>
      )}

      {!filtered && !loading && (samples > 0 || !items.length) && (
        <SampleBanner count={samples} onChanged={() => void refresh()} />
      )}
      {loading ? (
        <EmptyState title="Opening your library…" icon={<BookOpen />} />
      ) : !items.length ? (
        <EmptyState
          title={filtered ? 'No matching items' : 'Save your first item'}
          icon={<Library />}
          actions={
            <Button
              label={filtered ? 'Clear filters' : 'Add to library'}
              onClick={filtered ? clear : () => model.openCapture('article')}
            />
          }
        />
      ) : (
        <section
          className="standard-library-grid"
          aria-label="Saved items"
          aria-busy={session.updating || undefined}
        >
          {items.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              onOpen={() => setImageItem(item)}
              menuOpen={menuId === item.id}
              busy={busy}
              onMenu={(open) => setMenuId(open ? item.id : null)}
              onAction={(action) => void mutate(item, action)}
            />
          ))}
        </section>
      )}
      {!loading && session.hasMore && (
        <div className="library-pagination">
          <Button
            label={session.loadingMore ? 'Loading…' : 'Load more'}
            isDisabled={session.loadingMore}
            onClick={() => void session.loadMore()}
          />
        </div>
      )}
    </div>
  );
}
