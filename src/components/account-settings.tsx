'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/shared/auth-client';
import { useRouter } from 'next/navigation';
import { describeAgent } from '@/shared/user-agent';
export function AccountSettings({
  googleEnabled = false,
  linkingFailed = false,
  isOwner = false,
  section = 'account',
}: {
  googleEnabled?: boolean;
  linkingFailed?: boolean;
  isOwner?: boolean;
  section?: 'account' | 'sessions';
}) {
  const { data: session } = authClient.useSession(),
    router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState(
    linkingFailed
      ? 'Google could not be connected. Try again using the Google account with the same email as your Absolute Memory account.'
      : '',
  );
  const [busy, setBusy] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<
    {
      id: string;
      userAgent?: string | null;
      createdAt: string;
      lastActiveAt: string;
      current: boolean;
    }[]
  >([]);
  async function refresh() {
    const [s, a] = await Promise.all([
      fetch('/api/account/sessions', { cache: 'no-store' }),
      authClient.listAccounts(),
    ]);
    if (a.error) throw new Error(a.error.message || 'Could not load sign-in methods.');
    setHasPassword(a.data?.some((a) => a.providerId === 'credential') || false);
    setGoogleConnected(a.data?.some((a) => a.providerId === 'google') || false);
    const data = await s.json().catch(() => ({}));
    if (!s.ok) throw new Error(data.error || 'Could not load your sessions.');
    setSessions(data.sessions || []);
  }
  async function revoke(id: string) {
    const r = await fetch('/api/account/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await r.json().catch(() => ({}));
    if (data.code === 'SESSION_NOT_FRESH') {
      setNeedsReauth(true);
      return;
    }
    if (!r.ok) throw new Error(data.error || 'Could not sign out that session.');
    await refresh();
    setMessage('Session signed out.');
  }

  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="settings-card" hidden={section !== 'account'}>
        <h2>Your account</h2>
        <p>{session?.user.email}</p>
        <form
          className="account-form"
          key={session?.user.id}
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name')).trim();
            void action(async () => {
              const r = await authClient.updateUser({ name });
              if (r.error) throw new Error(r.error.message);
              setMessage('Profile updated.');
              router.refresh();
            });
          }}
        >
          <label>
            Name
            <input name="name" required maxLength={80} defaultValue={session?.user.name} />
          </label>
          <button className="button secondary" disabled={busy}>
            Save profile
          </button>
        </form>
        {googleEnabled && (
          <div>
            <h3>Google sign-in</h3>
            {googleConnected === null ? (
              <p>Loading sign-in methods…</p>
            ) : googleConnected ? (
              <p role="status">
                Google connected. You can sign in with Google and keep this library.
              </p>
            ) : (
              <>
                <p>
                  Connect the Google account for {session?.user.email} to sign in with Google and
                  keep your existing library.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const r = await authClient.linkSocial({
                        provider: 'google',
                        callbackURL: '/settings',
                        errorCallbackURL: '/settings',
                        loginHint: session?.user.email,
                      });
                      if (r.error) throw new Error(r.error.message || 'Could not connect Google.');
                    })
                  }
                >
                  Connect Google
                </button>
              </>
            )}
          </div>
        )}
        {hasPassword && (
          <details>
            <summary>Change password</summary>
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  data = new FormData(form);
                void action(async () => {
                  const r = await authClient.changePassword({
                    currentPassword: String(data.get('current')),
                    newPassword: String(data.get('next')),
                    revokeOtherSessions: true,
                  });
                  if (r.error) throw new Error(r.error.message);
                  form.reset();
                  await refresh();
                  setMessage('Password changed. Other sessions signed out.');
                });
              }}
            >
              <label>
                Current password
                <input type="password" name="current" required autoComplete="current-password" />
              </label>
              <label>
                New password
                <input
                  type="password"
                  name="next"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <button className="button secondary" disabled={busy}>
                Update password
              </button>
            </form>
          </details>
        )}
      </section>
      <section className="settings-card" hidden={section !== 'sessions'}>
        <h2>Signed-in sessions</h2>
        <p>
          Sign out a device you no longer use. Manage Chrome capture connections separately in
          Extension settings.
        </p>
        {needsReauth && (
          <div role="status">
            <p>For your security, sign in again before signing out other devices.</p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const r = await authClient.signOut();
                  if (r.error) throw new Error(r.error.message);
                  window.location.assign('/login?next=/settings');
                })
              }
            >
              Sign in again
            </button>
          </div>
        )}
        <div className="session-list">
          {sessions.map((s) => (
            <div key={s.id}>
              <span>
                <strong>{s.current ? 'This device' : describeAgent(s.userAgent)}</strong>
                <small>
                  {s.current ? describeAgent(s.userAgent) + ' · ' : ''}Signed in{' '}
                  {formatDay(s.createdAt)} · Last active {formatDay(s.lastActiveAt)}
                </small>
              </span>
              {!s.current && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action(() => revoke(s.id))}
                >
                  Sign out
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="button secondary"
          disabled={busy || sessions.length < 2}
          onClick={() =>
            void action(async () => {
              const r = await authClient.revokeOtherSessions();
              if (r.error?.code === 'SESSION_NOT_FRESH') {
                setNeedsReauth(true);
                return;
              }
              if (r.error) throw new Error(r.error.message);
              await refresh();
              setMessage('Other sessions signed out.');
            })
          }
        >
          Sign out other devices
        </button>
      </section>
      <section className="settings-card" hidden={section !== 'account' || isOwner}>
        <h2>Delete your account</h2>
        <p>
          This permanently deletes your library, notes, highlights, conversations, uploaded files,
          and capture connections. Export your library first if you want a copy.
        </p>
        <details>
          <summary>Delete account…</summary>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirm !== 'DELETE') return;
              const password = String(new FormData(e.currentTarget).get('password') || '');
              void action(async () => {
                const r = await authClient.deleteUser(password ? { password } : {});
                if (r.error)
                  throw new Error(r.error.message || 'Sign in again before deleting your account.');
                window.location.assign('/');
              });
            }}
          >
            <label>
              Type DELETE to confirm
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                required
                pattern="DELETE"
              />
            </label>
            {hasPassword ? (
              <label>
                Confirm your password
                <input type="password" name="password" autoComplete="current-password" required />
              </label>
            ) : (
              <p>For security, sign in again first if your session is older than five minutes.</p>
            )}
            <button className="button danger" disabled={busy || confirm !== 'DELETE'}>
              Permanently delete my account
            </button>
          </form>
          <button
            className="text-link"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const r = await authClient.signOut();
                if (r.error) throw new Error(r.error.message);
                window.location.assign('/login?next=/settings');
              })
            }
          >
            Sign in again
          </button>
        </details>
      </section>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="inline-status">
          {message}
        </p>
      )}
    </>
  );
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
