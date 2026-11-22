import { integrationIdentity } from '@/server/auth/integration-identity';
import { integrationResponse } from '@/server/auth/integration-http';
import { zipDownload } from '@/server/http/zip-download';
import { exportLibrary } from '@/server/services/transfers/export';

export async function GET(req: Request) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:read');
    return zipDownload(await exportLibrary(key.user_id));
  });
}
