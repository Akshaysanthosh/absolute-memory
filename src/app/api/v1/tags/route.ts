import { integrationIdentity } from '@/server/auth/integration-identity';
import { integrationResponse } from '@/server/auth/integration-http';
import { listIntegrationTags } from '@/server/services/integration-api';

export async function GET(req: Request) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:read');
    return Response.json({ tags: await listIntegrationTags(key.user_id) });
  });
}
