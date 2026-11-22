'use client';

import { useState } from 'react';
import { api } from '@/shared/client';
import type { Capabilities } from '@/shared/capabilities';

type Result = { provider: string; ok: boolean; detail: string };

export function ProviderSettings({
  capabilities,
  isOwner,
}: {
  capabilities: Capabilities;
  isOwner: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');

  async function testConnection() {
    setBusy(true);
    setError('');
    setResults([]);
    try {
      const response = await api<{ results: Result[] }>('/api/providers/test', { method: 'POST' });
      setResults(response.results);
    } catch {
      setError('Could not test the providers.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>AI and providers</h2>
      <p>Connection settings come from the instance environment.</p>
      <dl>
        <dt>Chat</dt>
        <dd>{capabilities.model ?? (capabilities.ai ? 'Available' : 'Off')}</dd>
        <dt>Embeddings</dt>
        <dd>{capabilities.embeddingModel ?? (capabilities.embeddings ? 'Available' : 'Off')}</dd>
        <dt>Transcription</dt>
        <dd>
          {capabilities.transcriptionModel ?? (capabilities.transcription ? 'Available' : 'Off')}
        </dd>
      </dl>
      {capabilities.embeddingNeedsRebuild && (
        <p role="status">
          Embedding settings changed. Keyword search is available. Run{' '}
          <code>absolute-memory reembed</code> to rebuild semantic search.
        </p>
      )}
      {isOwner && (capabilities.ai || capabilities.embeddingModel) && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void testConnection()}
        >
          {busy ? 'Testing…' : 'Test connection'}
        </button>
      )}
      {results.length > 0 && (
        <ul aria-live="polite">
          {results.map((result) => (
            <li key={result.provider}>
              {result.provider} {result.ok ? 'connected' : 'failed'}. {result.detail}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
