'use client';

import { plural } from '@/shared/plural';
import { useEffect, useState } from 'react';
import { api } from '@/shared/client';
import { API_KEY_LIFETIME_DAYS } from '@/shared/input-limits';

type PersonalKey = {
  id: string;
  label: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
};
const options = [
  ['library:read', 'Search and read your library'],
  ['library:write', 'Save content and check those saves'],
] as const;

export function IntegrationKeys() {
  const [keys, setKeys] = useState<PersonalKey[] | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PersonalKey | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ keys: PersonalKey[] }>('/api/integration-keys', { signal: controller.signal })
      .then((result) => setKeys(result.keys))
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const scopes = fields.getAll('scopes');
    const expiry = fields.get('expiry');
    setError('');
    if (!scopes.length) {
      setError('Choose at least one permission.');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ key: PersonalKey; token: string }>('/api/integration-keys', {
        method: 'POST',
        body: JSON.stringify({
          label: fields.get('label'),
          scopes,
          ...(expiry === 'never' ? { noExpiry: true } : { expiresInDays: Number(expiry) }),
        }),
      });
      setKeys((previous) => [result.key, ...(previous ?? [])]);
      setToken(result.token);
      form.reset();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: PersonalKey) {
    setError('');
    setBusy(true);
    try {
      await api('/api/integration-keys', {
        method: 'DELETE',
        body: JSON.stringify({ id: key.id }),
      });
      setKeys((previous) => previous?.filter((entry) => entry.id !== key.id) ?? []);
      setPending(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>Personal API keys</h2>
      <p>Give a tool access to your library. Choose the permissions it needs.</p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {token ? (
        <div className="inline-status">
          <p>Copy this key now. It is shown once.</p>
          <label>
            New API key
            <input
              readOnly
              value={token}
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button type="button" className="button secondary" onClick={() => setToken('')}>
            Done
          </button>
        </div>
      ) : (
        <form className="account-form" onSubmit={create}>
          <label>
            Key name
            <input name="label" required maxLength={80} placeholder="My CLI" />
          </label>
          <label>
            Expires
            <select name="expiry" defaultValue={API_KEY_LIFETIME_DAYS}>
              <option value="30">30 days</option>
              <option value={API_KEY_LIFETIME_DAYS}>{plural(API_KEY_LIFETIME_DAYS, 'day')}</option>
              <option value="365">One year</option>
              <option value="never">No expiry (revoke manually)</option>
            </select>
          </label>
          <fieldset>
            <legend>Permissions</legend>
            {options.map(([scope, description]) => (
              <label className="careful-choice" key={scope}>
                <input name="scopes" type="checkbox" value={scope} />
                {description}
              </label>
            ))}
          </fieldset>
          <button className="button primary" disabled={busy || keys === null}>
            Create key
          </button>
        </form>
      )}
      {keys?.length ? (
        <ul className="session-list">
          {keys.map((key) => (
            <li key={key.id}>
              <strong>{key.label}</strong>
              <p>
                {key.scopes
                  .map((scope) => options.find((option) => option[0] === scope)?.[1])
                  .join(' · ')}
              </p>
              <p>
                {key.expires_at
                  ? `Expires ${new Date(key.expires_at).toISOString().slice(0, 10)} UTC`
                  : 'No expiry'}
              </p>
              {pending?.id === key.id ? (
                <>
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy}
                    onClick={() => void revoke(key)}
                  >
                    Confirm revoke
                  </button>{' '}
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setToken('');
                    setPending(key);
                  }}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : keys ? (
        <p>No active personal keys.</p>
      ) : (
        !error && <p role="status">Loading keys…</p>
      )}
    </section>
  );
}
