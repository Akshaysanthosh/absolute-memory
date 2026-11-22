'use client';
import { plural } from '@/shared/plural';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '@/shared/client';
import './sample-banner.css';

export function SampleBanner({ count, onChanged }: { count: number; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'add' | 'remove' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function update(action: 'add' | 'remove') {
    setBusy(action);
    setError('');
    setMessage('');
    try {
      if (action === 'add') {
        const { added } = await api<{ added: number }>('/api/samples', { method: 'POST' });
        setMessage(
          added ? `${added} sample links queued.` : 'The sample links are already in your library.',
        );
      } else {
        await api('/api/samples', { method: 'DELETE' });
        setConfirming(false);
      }
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update sample saves.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sample-banner" aria-label="Sample saves">
      <Sparkles size={18} aria-hidden="true" />
      <div className="sample-banner-text">
        {confirming ? (
          <>
            <strong>Remove {count === 1 ? 'the sample' : `all ${plural(count, 'sample')}`}?</strong>
            <p>Highlights and notes attached to the samples will also be removed.</p>
          </>
        ) : (
          <>
            <strong>{count ? plural(count, 'sample save') : 'Try sample links'}</strong>
            <p>Adding sample links fetches public websites on this instance.</p>
          </>
        )}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="sample-banner-actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="sample-banner-primary"
              disabled={!!busy}
              onClick={() => void update('remove')}
            >
              {busy === 'remove' ? 'Removing…' : 'Remove samples'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="sample-banner-primary"
              disabled={!!busy}
              onClick={() => void update('add')}
            >
              {busy === 'add' ? 'Adding…' : 'Add sample links'}
            </button>
            {count > 0 && (
              <button type="button" disabled={!!busy} onClick={() => setConfirming(true)}>
                Remove samples
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
