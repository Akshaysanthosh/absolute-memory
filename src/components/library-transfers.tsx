'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/shared/client';

type Transfer = {
  id: string;
  kind: 'export' | 'import';
  state: 'uploading' | 'queued' | 'running' | 'ready' | 'failed' | 'expired';
  processed: number;
  total: number | null;
  imported: number;
  duplicates: number;
  skipped: number;
  error: string | null;
};
const choices = [
  ['absolute-memory', 'Absolute Memory ZIP', '.zip'],
  ['netscape', 'Browser bookmarks', '.html,.htm'],
  ['pocket', 'Pocket', '.html,.htm,.csv'],
  ['instapaper', 'Instapaper', '.csv'],
  ['omnivore', 'Omnivore', '.zip,.json'],
  ['readwise', 'Readwise Reader', '.csv,.zip'],
  ['raindrop', 'Raindrop', '.csv'],
] as const;

export function LibraryTransfers({ mode }: { mode?: 'import' | 'export' }) {
  const [format, setFormat] = useState<string>(choices[0][0]);
  const [file, setFile] = useState<File>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Transfer[]>([]);
  const [request, setRequest] = useState<'import' | 'export' | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await api<{ jobs: Transfer[] }>('/api/transfers');
        if (!mounted) return;
        setJobs(response.jobs);
        if (response.jobs.some((job) => ['uploading', 'queued', 'running'].includes(job.state)))
          timer = setTimeout(load, 2000);
      } catch {
        if (mounted) setError('Could not load the transfer history.');
      }
    }
    void load();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  async function start(kind: 'import' | 'export') {
    if (request || (kind === 'import' && !file)) return;
    setRequest(kind);
    setError('');
    try {
      const params = new URLSearchParams({ kind, ...(kind === 'import' ? { format } : {}) });
      const response = await fetch(`/api/transfers?${params}`, {
        method: 'POST',
        headers: kind === 'import' ? { 'Content-Type': 'application/octet-stream' } : undefined,
        body: kind === 'import' ? file : undefined,
      });
      if (!response.ok)
        throw new Error((await response.json()).error || 'The transfer could not be queued.');
      if (kind === 'import') {
        setFile(undefined);
        if (fileInput.current) fileInput.current.value = '';
      }
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The transfer could not be queued.');
    } finally {
      setRequest(null);
    }
  }

  const visible = jobs.filter((job) => !mode || job.kind === mode);
  return (
    <>
      {mode !== 'export' && (
        <section className="settings-card">
          <h2>Import your library</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void start('import');
            }}
          >
            <p>
              <label>
                Import format{' '}
                <select
                  value={format}
                  onChange={(event) => {
                    setFormat(event.target.value);
                    setFile(undefined);
                  }}
                >
                  {choices.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </p>
            <p>
              <label>
                Import file{' '}
                <input
                  key={format}
                  ref={fileInput}
                  type="file"
                  required
                  accept={choices.find((choice) => choice[0] === format)?.[2]}
                  onChange={(event) => setFile(event.target.files?.[0])}
                />
              </label>
            </p>
            <button className="button secondary" disabled={!file || !!request}>
              {request === 'import' ? 'Uploading…' : 'Import'}
            </button>
          </form>
        </section>
      )}
      {mode !== 'import' && (
        <section className="settings-card">
          <h2>Export your library</h2>
          <p>Download saved items, highlights, notes, conversations and original files as a ZIP.</p>
          <button
            className="button secondary"
            type="button"
            disabled={!!request}
            onClick={() => void start('export')}
          >
            Export everything
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {visible.length > 0 && (
        <section className="settings-card" aria-label="Transfers" aria-live="polite">
          <ul>
            {visible.map((job) => (
              <li key={job.id}>
                {job.kind === 'export' ? 'Export' : 'Import'} ·{' '}
                {job.state === 'ready'
                  ? 'Ready'
                  : job.state === 'running'
                    ? 'Working'
                    : job.state === 'queued'
                      ? 'Queued'
                      : job.state === 'uploading'
                        ? 'Uploading'
                        : job.state === 'failed'
                          ? 'Failed'
                          : 'Expired'}
                {job.kind === 'import' && job.total !== null && (
                  <span>
                    {' '}
                    · {job.processed} of {job.total} processed · {job.imported} added ·{' '}
                    {job.duplicates} already saved{job.skipped ? ` · ${job.skipped} skipped` : ''}
                  </span>
                )}
                {job.error && <span> · {job.error}</span>}
                {job.kind === 'export' && job.state === 'ready' && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={`/api/transfers/${job.id}`} download>
                      Download ZIP
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
