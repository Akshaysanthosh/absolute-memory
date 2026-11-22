'use client';
import { ErrorScreen } from '@/components/error-screen';

export default function ApplicationError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorScreen
      error={error}
      retry={retry}
      home={{ href: '/library', label: 'Open your library' }}
    />
  );
}
