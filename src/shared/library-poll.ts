import { pollWhileVisible } from '@/shared/visible-poll';
/** Refresh loaded pages only when the server's compact library revision changes. */
export function pollLibrary(options: {
  importing: boolean;
  organizing: boolean;
  refresh: () => Promise<unknown>;
  afterRefresh?: (signal: AbortSignal) => Promise<void>;
}) {
  let revision: string | undefined,
    lastRecovery = 0;
  return pollWhileVisible(
    async (signal) => {
      if (Date.now() - lastRecovery >= 60000) {
        lastRecovery = Date.now();
        const paths = [
          ...(options.importing ? ['/api/imports/run'] : []),
          ...(options.organizing ? ['/api/knowledge/run'] : []),
        ];
        await Promise.all(
          paths.map((path) => fetch(path, { method: 'POST', signal }).catch(() => {})),
        );
      }
      if (signal.aborted) return false;
      const response = await fetch('/api/library/revision', { signal, cache: 'no-store' });
      if (response.status === 401) return false;
      if (!response.ok) throw Error('Library status unavailable');
      const data = (await response.json()) as { revision: string };
      if (revision !== data.revision) {
        await options.refresh();
        if (signal.aborted) return false;
        await options.afterRefresh?.(signal);
        revision = data.revision;
      }
      return true;
    },
    { intervalMs: 15000, onError: () => {} },
  );
}
