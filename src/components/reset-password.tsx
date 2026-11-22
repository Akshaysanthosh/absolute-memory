'use client';
import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '@/shared/auth-client';
export function ResetPassword({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  if (!token)
    return (
      <section className="auth-form">
        <h2>This link is incomplete.</h2>
        <p>Request a new password reset link from the sign-in page.</p>
        <Link href="/login">Back to sign in</Link>
      </section>
    );
  if (done)
    return (
      <section className="auth-form">
        <h2>Password updated.</h2>
        <p>
          Your previous sessions, personal API keys, and extension connections have been revoked.
        </p>
        <Link className="button primary" href="/login">
          Sign in
        </Link>
      </section>
    );
  return (
    <form
      method="post"
      className="auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const data = new FormData(e.currentTarget);
        try {
          if (data.get('password') !== data.get('confirm'))
            throw new Error('The passwords do not match.');
          const r = await authClient.resetPassword({
            token,
            newPassword: String(data.get('password')),
          });
          if (r.error)
            throw new Error(r.error.message || 'The link may have expired. Request a new one.');
          setDone(true);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>A fresh start.</h2>
      <label>
        New password
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
        Confirm new password
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
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? 'Updating…' : 'Update password'}
      </button>
      <Link href="/login">Back to sign in</Link>
    </form>
  );
}
