import { Button } from '@astryxdesign/core/Button';
import { FileText, RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { pollWhileVisible } from '@/shared/visible-poll';
import { sourceLink, type ReaderDocument } from './reader-header';

export function ReaderUnavailable({ item }: { item: ReaderDocument }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const failed = item.status === 'failed';
  const preparing = item.status === 'pending' || item.status === 'processing';
  const link = sourceLink(item);

  useEffect(() => {
    if (!preparing) return;
    return pollWhileVisible(
      async (signal) => {
        const response = await fetch(`/api/items/${item.id}/status`, { signal, cache: 'no-store' });
        if (response.status === 401 || response.status === 404) {
          router.refresh();
          return false;
        }
        if (!response.ok) throw Error('Could not check preparation.');
        const status = await response.json();
        if (status.ready || status.failed) {
          router.refresh();
          return false;
        }
        return true;
      },
      { onError: () => {}, intervalMs: 1500 },
    );
  }, [item.id, preparing, router]);

  async function retry() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retry: true }),
      });
      if (!response.ok) throw Error('Could not restart extraction. Please try again.');
      router.refresh();
    } catch {
      setError('Could not restart extraction. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="reading-empty" aria-live="polite">
      <FileText size={22} aria-hidden="true" />
      <h2>{preparing ? 'Preparing this item…' : 'This item has no readable text'}</h2>
      <p>
        {preparing
          ? 'The reader will open when the text is ready.'
          : failed
            ? 'We couldn’t extract the text from this source.'
            : 'The saved item doesn’t contain text for the reader.'}
      </p>
      <div>
        {link && <Button href={link} label="Open original" size="sm" variant="secondary" />}
        {failed && (
          <Button
            label="Try again"
            icon={<RotateCw size={15} />}
            size="sm"
            isLoading={busy}
            onClick={() => void retry()}
          />
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
