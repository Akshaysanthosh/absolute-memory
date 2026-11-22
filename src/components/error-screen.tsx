'use client';

import './error-screen.css';

type Props = {
  error: unknown;
  retry?: () => void;
  /** Where the secondary button goes: the library inside the app, the home page on public pages. */
  home?: { href: string; label: string };
};

function digestOf(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string'
    ? error.digest
    : undefined;
}

/** Branded fallback for unexpected errors, shared by every error boundary. */
export function ErrorScreen({ error, retry, home = { href: '/', label: 'Home page' } }: Props) {
  const digest = digestOf(error);
  return (
    <div className="am-error" data-astryx-theme="neutral" role="alert">
      <main>
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          aria-hidden="true"
          style={{ marginBottom: 20 }}
        >
          <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="10" y1="10" x2="22" y2="22" />
            <line x1="34" y1="10" x2="22" y2="22" />
            <line x1="10" y1="34" x2="22" y2="22" />
            <line x1="34" y1="34" x2="22" y2="22" />
          </g>
          <circle cx="10" cy="10" r="5" fill="var(--color-warning)" />
          <circle cx="34" cy="10" r="5" fill="var(--color-info)" />
          <circle cx="10" cy="34" r="5" fill="var(--color-success)" />
          <circle cx="34" cy="34" r="5" fill="var(--color-error)" />
          <circle cx="22" cy="22" r="6" fill="currentColor" />
        </svg>
        <p className="eyebrow">Something went wrong</p>
        <h1>We couldn’t load this page.</h1>
        <p className="lead">
          This one is on us, and your saved library is safe. Try again in a moment.
        </p>
        <div className="actions">
          {retry && (
            <button type="button" className="primary" onClick={() => retry()}>
              Try again
            </button>
          )}
          <a className={retry ? 'secondary' : 'primary'} href={home.href}>
            {home.label}
          </a>
        </div>
        {digest && (
          <p className="ref">
            Error reference <code>{digest}</code>
          </p>
        )}
      </main>
    </div>
  );
}
