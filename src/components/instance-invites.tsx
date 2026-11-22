'use client';

import { useEffect, useState } from 'react';
import { api } from '@/shared/client';

type Invite = { id: string; expires_at: string; used_at: string | null };

export function InstanceInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function refresh(signal?: AbortSignal) {
    try {
      const result = await api<{ invites: Invite[] }>('/api/invites', { signal });
      if (!signal?.aborted) setInvites(result.invites);
    } catch (failure) {
      if (!signal?.aborted)
        setError(failure instanceof Error ? failure.message : 'Could not load invites.');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  async function update(id?: string) {
    setBusy(true);
    setError('');
    setStatus('');
    setUrl('');
    try {
      if (id) {
        await api('/api/invites', { method: 'DELETE', body: JSON.stringify({ id }) });
        setStatus('Invite revoked.');
      } else {
        const result = await api<{ url: string }>('/api/invites', { method: 'POST' });
        setUrl(result.url);
      }
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update invites.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>Invites</h2>
      <p>Each link can create one account and expires after 24 hours.</p>
      <button
        type="button"
        className="button primary"
        disabled={busy}
        onClick={() => void update()}
      >
        Create invite
      </button>
      {url && (
        <div className="token-result">
          <label>
            Invite link
            <input
              aria-label="Invite link"
              value={url}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              void navigator.clipboard
                .writeText(url)
                .then(() => setStatus('Invite copied.'))
                .catch(() => setStatus('Select the link to copy it.'));
            }}
          >
            Copy invite
          </button>
        </div>
      )}
      {invites.length > 0 && (
        <ul>
          {invites.map((invite) => {
            const expired = Date.parse(invite.expires_at) <= Date.now();
            return (
              <li key={invite.id}>
                {invite.used_at
                  ? 'Used'
                  : expired
                    ? 'Expired'
                    : `Expires ${new Date(invite.expires_at).toLocaleString()}`}{' '}
                {!invite.used_at && !expired && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void update(invite.id)}
                  >
                    Revoke
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
