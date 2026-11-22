'use client';
import { newUserCallback } from '@/shared/signup-callback';
import { loginPathFor } from '@/shared/return-path';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/shared/auth-client';
import { ArrowRight, LoaderCircle } from 'lucide-react';
export function AuthForm({
  initialSignup = false,
  allowSignup = false,
  emailReset = false,
  googleEnabled = false,
  githubEnabled = false,
  returnTo = '/library',
  oauthError = '',
}: {
  initialSignup?: boolean;
  allowSignup?: boolean;
  emailReset?: boolean;
  googleEnabled?: boolean;
  githubEnabled?: boolean;
  returnTo?: string;
  oauthError?: string;
}) {
  const [signup, setSignup] = useState(allowSignup && initialSignup);
  const [reset, setReset] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(
    oauthError === 'account_not_linked'
      ? 'Sign in with your existing password, then connect your provider in Settings.'
      : oauthError
        ? 'Sign-in was not completed. Please try again.'
        : '',
  );
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const router = useRouter();

  async function social(provider: 'google' | 'github') {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: returnTo,
        newUserCallbackURL: newUserCallback(returnTo),
        errorCallbackURL: loginPathFor(returnTo),
      });
      if (result.error) throw new Error(result.error.message || 'Unable to sign in.');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget),
      email = String(form.get('email'));
    try {
      setMessage('');
      if (reset) {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: '/reset-password',
        });
        if (result.error)
          throw new Error(result.error.message || 'Could not request a reset link.');
        setMessage('If this account exists, a reset link is on its way.');
        return;
      }
      const input = { email, password: String(form.get('password')) };
      const result = signup
        ? await authClient.signUp.email({
            ...input,
            name: String(form.get('name')),
            callbackURL: returnTo,
          })
        : await authClient.signIn.email(input);
      if (result.error) throw new Error(result.error.message || 'Unable to sign in.');
      if (
        result.data &&
        'redirect' in result.data &&
        result.data.redirect &&
        'url' in result.data &&
        result.data.url
      )
        return;
      router.push(returnTo);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" className="auth-form" onSubmit={submit}>
      <span className="eyebrow">{signup ? 'save. read. ask. connect.' : 'ABSOLUTE MEMORY'}</span>
      <h2>{reset ? 'Reset your password' : signup ? 'Create your account' : 'Sign in'}</h2>
      <p>
        {reset
          ? 'Enter the email address for your account.'
          : signup
            ? 'Enter your details to start your library.'
            : 'Sign in to your library, reader and connections.'}
      </p>
      {!reset && googleEnabled && (
        <button
          type="button"
          className="button secondary full"
          disabled={!hydrated || busy}
          onClick={() => void social('google')}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6C30.03 37.65 27.26 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
            />
          </svg>
          Continue with Google
        </button>
      )}
      {!reset && githubEnabled && (
        <button
          type="button"
          className="button secondary full"
          disabled={!hydrated || busy}
          onClick={() => void social('github')}
        >
          Continue with GitHub
        </button>
      )}
      {!reset && signup && (
        <label>
          Your name
          <input disabled={!hydrated} name="name" autoComplete="name" required maxLength={80} />
        </label>
      )}
      <label>
        Email address
        <input
          disabled={!hydrated}
          name="email"
          autoComplete="email"
          type="email"
          required
          placeholder="you@example.com"
        />
      </label>
      {!reset && (
        <label>
          Password
          <input
            disabled={!hydrated}
            name="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={10}
            maxLength={128}
            placeholder={signup ? 'At least 10 characters' : 'Your password'}
          />
        </label>
      )}
      <button
        className="button primary full"
        disabled={!hydrated || busy}
        aria-label={busy ? 'Working…' : undefined}
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <>
            {reset ? 'Send reset link' : signup ? 'Create your account' : 'Sign in'}
            <ArrowRight size={17} />
          </>
        )}
      </button>
      {!reset && allowSignup && (
        <p className="auth-switch">
          {signup ? 'Already have an account?' : 'New to Absolute Memory?'}{' '}
          <button
            type="button"
            disabled={!hydrated || busy}
            onClick={() => {
              setSignup(!signup);
              setError('');
            }}
          >
            {signup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      )}
      {emailReset && !signup && (
        <button
          type="button"
          className="text-link"
          disabled={!hydrated || busy}
          onClick={() => {
            setReset(!reset);
            setError('');
            setMessage('');
          }}
        >
          {reset ? 'Back to sign in' : 'Forgot password?'}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
    </form>
  );
}
