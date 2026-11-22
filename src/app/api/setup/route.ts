import { assertSameOrigin, body, route } from '@/server/auth/http';
import { enforceAuthAddress, enforceEmailRateLimit } from '@/server/security/rate-limit';
import { createInstanceAccount, setupInput } from '@/server/services/instance';

export async function POST(request: Request) {
  return route(async () => {
    assertSameOrigin(request);
    const input = await body(request, setupInput, 4_096);
    await enforceEmailRateLimit('auth-setup', input.email);
    await enforceAuthAddress(request);
    return Response.json(await createInstanceAccount(input), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
