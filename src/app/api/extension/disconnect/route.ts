import { identity, route, HttpError } from '@/server/auth/http';
import { revokeCaptureToken } from '@/server/services/capture-tokens';
import { extensionCors, withExtensionCors } from '@/server/auth/extension';
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCors });
}
export async function POST(req: Request) {
  return withExtensionCors(
    await route(async () => {
      const auth = await identity(req, true);
      if (!auth.captureTokenId) throw new HttpError(401, 'An extension connection is required.');
      await revokeCaptureToken(auth.userId, auth.captureTokenId);
      return Response.json({ ok: true });
    }),
  );
}
