import { integrationIdentity } from '@/server/auth/integration-identity';
import { integrationResponse } from '@/server/auth/integration-http';
import { body } from '@/server/auth/http';
import { askInput } from '@/server/http/integration-contracts';
import { answerLibrary } from '@/server/services/knowledge/answer';

export async function POST(req: Request) {
  return integrationResponse(async () => {
    const key = await integrationIdentity(req, 'library:read');
    const input = await body(req, askInput, 16_000);
    return Response.json(await answerLibrary(key.user_id, input.question, input, req.signal));
  });
}
