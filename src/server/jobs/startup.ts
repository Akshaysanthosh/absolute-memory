import { getConfig } from '@/server/config';
import { getDatabase } from '@/server/db';
import { startWorkerLoop } from './runtime';

export async function startNodeRuntime(phase?: string) {
  if (phase === 'phase-production-build') return;
  const config = getConfig();
  if (config.NODE_ENV === 'test' || config.ROLE !== 'all') return;
  const runtime = globalThis as typeof globalThis & {
    amWorkerStop?: ReturnType<typeof startWorkerLoop>;
  };
  runtime.amWorkerStop ??= startWorkerLoop(getDatabase);
}
