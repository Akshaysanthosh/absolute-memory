import { HttpError } from '@/server/auth/http';
import { integrationResponse } from '@/server/auth/integration-http';
import { integrationIdentity } from '@/server/auth/integration-identity';
import { assertItemOwner } from '@/server/services/library';
import { listHighlightPage } from '@/server/services/reading';
import { highlightsQuery } from '@/server/http/integration-contracts';

export function GET(request: Request) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(request, 'library:read');
    const query = highlightsQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new HttpError(400, 'Provide a valid item ID, page limit, or offset.');
    if (query.data.itemId) await assertItemOwner(key.user_id, query.data.itemId);
    return Response.json(await listHighlightPage(key.user_id, query.data));
  });
}
