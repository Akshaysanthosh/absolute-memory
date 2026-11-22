'use client';
import { useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { api } from '@/shared/client';
import styles from './preferences.module.css';
type Token = { id: string; name: string; created_at: string; last_used_at: string | null };
export function ConnectionsView({ appUrl }: { appUrl: string }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setTokens((await api<{ tokens: Token[] }>('/api/tokens')).tokens);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const d = await api<{ token: string }>('/api/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: String(new FormData(event.currentTarget).get('name')) }),
      });
      setToken(d.token);
      setMessage('Connection created. Copy the key now; it is shown only once.');
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="settings-card">
        <h2>Chromium extension</h2>
        <p>Save the current page or a text selection from your browser.</p>
        <label>
          Server address
          <input readOnly value={appUrl} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <details className={styles.guide}>
          <summary>Installation steps</summary>
          <ol>
            <li>
              Run <code>npm run extension:zip</code> from the checkout and unzip the archive.
            </li>
            <li>
              Open <code>chrome://extensions</code>, enable Developer mode, and load the unzipped
              folder.
            </li>
            <li>
              Enter the server address in the extension options and approve the matching pairing
              code.
            </li>
          </ol>
        </details>
      </section>
      <section className="settings-card token-section">
        <KeyRound />
        <h2>Capture keys</h2>
        <p>
          Chrome connections appear here automatically after pairing. They can save items and check
          those saves’ status, but cannot browse your library. Manual keys are available for other
          capture tools.
        </p>
        <details className={styles.manual}>
          <summary>Create a manual capture key</summary>
          <form onSubmit={create} className="inline-form">
            <label>
              Connection name
              <input name="name" required maxLength={80} placeholder="My Chrome browser" />
            </label>
            <button disabled={busy} className="button primary">
              Create capture key
            </button>
          </form>
        </details>
        {token && (
          <div className="token-result">
            <label>
              Copy once
              <input readOnly value={token} aria-label="New capture key" />
            </label>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(token);
                  setMessage('Copied. Use it in your capture tool.');
                } catch {
                  setMessage('Select and copy the key manually.');
                }
              }}
            >
              <Copy size={15} />
              Copy
            </button>
            <button className="text-link" onClick={() => setToken('')}>
              Hide key
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="inline-status">
            {message}
          </p>
        )}
        <div className="token-list">
          {tokens.map((t) => (
            <div key={t.id}>
              <span>
                <strong>{t.name}</strong>
                <small>
                  {t.name.includes('paired')
                    ? ''
                    : `Connected ${new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · `}
                  {t.last_used_at
                    ? `Last used ${new Date(t.last_used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : 'Not used yet'}
                </small>
              </span>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await api('/api/tokens', {
                      method: 'DELETE',
                      body: JSON.stringify({ id: t.id }),
                    });
                    setToken('');
                    await refresh();
                    setMessage('Key revoked. That connection can no longer save items.');
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                <Trash2 size={14} />
                Revoke
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
