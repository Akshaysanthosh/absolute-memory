'use client';
import Link from 'next/link';
import { pollWhileVisible } from '@/shared/visible-poll';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { itemIsReady, preparationFailed } from '@/shared/item-readiness';
import type { Item } from '@/shared/types';

export function PreparingItem({ item }: { item: Item }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const failed = preparationFailed(item);
  useEffect(() => {
    if (failed || itemIsReady(item)) return;
    return pollWhileVisible(
      async (signal) => {
        const response = await fetch(`/api/items/${item.id}/status`, { signal, cache: 'no-store' });
        if (response.status === 401 || response.status === 404) {
          router.refresh();
          return false;
        }
        if (!response.ok) throw Error('Status check failed');
        const status = await response.json();
        if (status.ready || status.failed) {
          router.refresh();
          return false;
        }
        return true;
      },
      { onError: () => {} },
    );
  }, [failed, item.id, item.status, item.reading_ready, item.media_kind, router]);
  async function retry() {
    setBusy(true);
    setError('');
    try {
      const organization = item.status === 'ready' && Boolean(item.media_kind);
      const response = await fetch(`/api/items/${item.id}${organization ? '/knowledge' : ''}`, {
        method: organization ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(organization ? {} : { body: JSON.stringify({ retry: true }) }),
      });
      if (!response.ok) throw Error('Could not restart preparation. Please try again.');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (itemIsReady(item)) return null;
  return (
    <section style={{ maxWidth: 640, margin: '80px auto', padding: 24 }} aria-live="polite">
      <h1>{item.title}</h1>
      <h2>{failed ? 'Preparation needs attention' : 'Preparing…'}</h2>
      <p>
        {failed
          ? item.error || 'The readable article could not be prepared. Please retry.'
          : 'This item will open when it is ready. You can return to your library while it is prepared.'}
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/library">Back to library</Link>
        {(item.url || item.media_url) && (
          <a href={(item.url || item.media_url)!} target="_blank" rel="noopener noreferrer">
            Open original
          </a>
        )}
        {failed && (
          <button type="button" onClick={retry} disabled={busy}>
            {busy ? 'Retrying…' : 'Retry preparation'}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
