import type { Metadata } from 'next';
import { AbsoluteMark } from '@/components/home/source-icons';

export const metadata: Metadata = {
  title: 'Page not found · Absolute Memory',
  robots: { index: false, follow: false },
};

/** Branded 404 for unmatched URLs. This page carries its own styles. */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#FFFFFF',
          color: '#111111',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        <main style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', marginBottom: 20 }}>
            <AbsoluteMark size={48} ink="#111111" />
          </div>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: '#E60023',
            }}
          >
            404
          </p>
          <h1
            style={{
              margin: '0 0 12px',
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-.03em',
            }}
          >
            This page isn’t connected to anything.
          </h1>
          <p style={{ margin: '0 0 28px', fontSize: 17, lineHeight: 1.6, color: '#333333' }}>
            The link may be old or mistyped. Your library is safe.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="/library"
              style={{
                background: '#1A7F4B',
                color: '#FFFFFF',
                padding: '14px 22px',
                borderRadius: 999,
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Open your library
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
