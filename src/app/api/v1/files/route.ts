import { integrationIdentity } from '@/server/auth/integration-identity';
import { integrationResponse, scheduleIntegrationWork } from '@/server/auth/integration-http';
import { recordIntegrationSave } from '@/server/services/integration-api';
import { readUpload } from '@/server/http/document-upload';
import { saveOrReuseUpload } from '@/server/services/document-upload';

export async function POST(req: Request) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:write');
    const { id, status, duplicate } = await saveOrReuseUpload(await readUpload(req), key.user_id);
    await recordIntegrationSave(key, id);
    if (status === 'pending' || status === 'processing') scheduleIntegrationWork(key.user_id, true);
    const statusPath = `/api/v1/saves/${id}`;
    return Response.json(
      { id, status, duplicate, statusPath },
      { status: duplicate ? 200 : 201, headers: { Location: statusPath } },
    );
  });
}
