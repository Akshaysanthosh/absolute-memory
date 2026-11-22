import { z } from 'zod';
import { body, identity, route } from '@/server/auth/http';
import { completeSetup, checklist, dismissChecklist } from '@/server/services/onboarding-setup';

const action = z.discriminatedUnion(
  'action',
  [
    z.object({
      action: z.literal('setup'),
      persona: z.unknown().optional(),
      interests: z.unknown().optional(),
      extension: z.unknown().optional(),
    }),
    z.object({ action: z.literal('dismiss') }),
  ],
  { error: 'Unknown onboarding action.' },
);

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    return Response.json(await checklist(userId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const input = await body(req, action);
    if (input.action === 'setup') await completeSetup(userId, input);
    else await dismissChecklist(userId);
    return Response.json({ ok: true });
  });
}
