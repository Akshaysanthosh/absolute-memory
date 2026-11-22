import { integrationIdentity } from '@/server/auth/integration-identity';
import { HttpError, resourceId } from '@/server/auth/http';
import { readIntegrationItem } from '@/server/services/integration-api';
import { offset as offsetSchema } from '@/server/http/integration-contracts';
import { integrationResponse } from '@/server/auth/integration-http';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:read');
    const id = resourceId((await params).id);
    const offset = offsetSchema.safeParse(new URL(req.url).searchParams.get('offset') ?? undefined);
    if (!offset.success) throw new HttpError(400, 'Offset must be a nonnegative integer.');
    return Response.json(await readIntegrationItem(key.user_id, id, offset.data));
  });
}
