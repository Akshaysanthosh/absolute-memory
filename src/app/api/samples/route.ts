import { identity, route } from '@/server/auth/http';
import { addSampleLinks, removeSamples } from '@/server/services/samples/seed';

/** Removes every sample save from the account. The user's own saves are never touched. */
export async function DELETE(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    return Response.json({ removed: await removeSamples(userId) });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    return Response.json({ added: await addSampleLinks(userId) }, { status: 202 });
  });
}
