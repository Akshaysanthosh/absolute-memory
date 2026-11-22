'use client';
import { ErrorScreen } from '@/components/error-screen';

export default function ReaderError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorScreen
      error={error}
      retry={retry}
      home={{ href: '/library', label: 'Back to your library' }}
    />
  );
}
