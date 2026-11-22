import { afterInlineWork } from '@/server/jobs/inline';
import { route } from '@/server/auth/http';
import { requireIntegrations } from '@/server/auth/integration-identity';
import { runBatch } from '@/server/jobs/worker';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';

export async function integrationResponse(fn: () => Promise<Response>) {
  const response = await route(async () => {
    requireIntegrations();
    return fn();
  });
  response.headers.set('Cache-Control', 'no-store');
  if (response.status === 401)
    response.headers.set('WWW-Authenticate', 'Bearer realm="Absolute Memory"');
  return response;
}

export function scheduleIntegrationWork(userId: string, importPending: boolean) {
  afterInlineWork(async () => {
    if (importPending) await runBatch(userId);
    await runKnowledgeBatch(userId);
  });
}
