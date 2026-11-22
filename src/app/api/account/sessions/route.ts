import { z } from 'zod';
import { getAuth } from '@/server/auth/auth';
import { body, HttpError, identity, route } from '@/server/auth/http';
import { endAccountSession, listAccountSessions } from '@/server/services/account-sessions';

async function currentSession(req: Request) {
  const result = await (await getAuth()).api.getSession({ headers: req.headers });
  if (!result) throw new HttpError(401, 'Sign in to continue.');
  return result.session;
}

export async function GET(req: Request) {
  return route(async () => {
    const sessions = await listAccountSessions(await currentSession(req));
    return Response.json({ sessions }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    await identity(req);
    const session = await currentSession(req);
    const { id } = await body(req, z.object({ id: z.string().min(1).max(200) }), 2_000);
    const result = await endAccountSession(session, id);
    if (result === 'current') throw new HttpError(400, 'Use Sign out to end this session.');
    if (result === 'missing') throw new HttpError(404, 'That session has already ended.');
    if (result === 'stale')
      return Response.json(
        { error: 'Sign in again to sign out other devices.', code: 'SESSION_NOT_FRESH' },
        { status: 403 },
      );
    return Response.json({ ok: true });
  });
}
