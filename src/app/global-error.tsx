'use client';
import { ErrorScreen } from '@/components/error-screen';

/** Replaces a root layout that failed to render, for example when the session lookup cannot reach the database. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <title>Something went wrong · Absolute Memory</title>
        <meta name="robots" content="noindex, nofollow" />
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
