'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/shared/auth-client';
import { api } from '@/shared/client';
import { AbsoluteMark } from '@/components/home/source-icons';

export function SetupAccountForm({ invited }: { invited: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim().toLowerCase();
    const password = String(form.get('password'));
    try {
      if (password !== form.get('confirm')) throw new Error('The passwords do not match.');
      const token = invited
        ? new URLSearchParams(window.location.hash.slice(1)).get('token')
        : null;
      if (invited && !token)
        throw new Error('Open the complete invite link from the instance owner.');
      await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          email,
          password,
          ...(token ? { invite: token } : {}),
        }),
      });
      setCreated(true);
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error('Your account was created. Sign in to continue.');
      window.location.replace('/welcome');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Account setup failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="setup" aria-labelledby="instance-setup-title">
      <div className="setup-card">
        <div className="setup-mark">
          <AbsoluteMark size={36} ink="currentColor" />
        </div>
        <h1 id="instance-setup-title">
          {invited ? 'Accept your invite' : 'Set up Absolute Memory'}
        </h1>
        <p className="setup-lead">
          {invited
            ? 'Create an account on this instance.'
            : 'Create the owner account for this instance.'}
        </p>
        <form className="setup-account-fields" method="post" onSubmit={submit}>
          <label>
            Name
            <input name="name" autoComplete="name" maxLength={80} required />
          </label>
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" maxLength={254} required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p className="setup-error" role="alert">
              {error}
            </p>
          )}
          {created ? (
            <Link href="/login" className="setup-primary">
              Sign in
            </Link>
          ) : (
            <button className="setup-primary" disabled={!ready || busy}>
              {busy ? 'Creating account…' : invited ? 'Create account' : 'Create owner account'}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
