import { integrationIdentity } from '@/server/auth/integration-identity';
import { resourceId } from '@/server/auth/http';
import { integrationSaveStatus } from '@/server/services/integration-api';
import { integrationResponse, scheduleIntegrationWork } from '@/server/auth/integration-http';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:write');
    const item = await integrationSaveStatus(key, resourceId((await params).id));
    if (item.status === 'pending' || item.status === 'processing') {
      scheduleIntegrationWork(key.user_id, true);
    }
    return Response.json(item);
  });
}
