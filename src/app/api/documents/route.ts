import { identity, route } from '@/server/auth/http';
import { readUpload } from '@/server/http/document-upload';
import { enforceRateLimit } from '@/server/security/rate-limit';
import { saveUpload } from '@/server/services/document-upload';

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    await enforceRateLimit('capture', userId);
    const { id, duplicate, status } = await saveUpload(await readUpload(req), userId);
    return Response.json({ id, duplicate }, { status: status === 'pending' ? 202 : 200 });
  });
}
