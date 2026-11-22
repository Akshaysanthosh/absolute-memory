import { integrationIdentity } from '@/server/auth/integration-identity';
import { body, HttpError } from '@/server/auth/http';
import { listIntegrationItems, saveIntegrationItem } from '@/server/services/integration-api';
import { integrationCaptureSchema, listQuery } from '@/server/http/integration-contracts';
import { integrationResponse, scheduleIntegrationWork } from '@/server/auth/integration-http';

export async function GET(req: Request) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:read');
    const query = listQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!query.success)
      throw new HttpError(400, 'Check the search query, filters, and page limit.');
    return Response.json(await listIntegrationItems(key.user_id, query.data));
  });
}

export async function POST(req: Request) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:write');
    const input = await body(req, integrationCaptureSchema, 450_000);
    const { item, duplicate } = await saveIntegrationItem(
      key,
      input,
      req.headers.get('idempotency-key'),
    );
    const pending = item.status === 'pending' || item.status === 'processing';
    if (!duplicate || pending) {
      scheduleIntegrationWork(key.user_id, pending);
    }
    const statusPath = '/api/v1/saves/' + item.id;
    return Response.json(
      { id: item.id, status: item.status, duplicate, statusPath },
      {
        status: duplicate ? 200 : 201,
        headers: { Location: statusPath },
      },
    );
  });
}
