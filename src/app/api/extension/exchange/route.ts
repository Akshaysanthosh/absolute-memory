import { describeAgent } from '@/shared/user-agent';
import { route, body } from '@/server/auth/http';
import {
  exchangePair,
  exchangeSchema,
  extensionCors,
  withExtensionCors,
} from '@/server/auth/extension';
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCors });
}
export async function POST(req: Request) {
  return withExtensionCors(
    await route(async () => {
      const { verifier } = await body(req, exchangeSchema, 1000);
      const agent = describeAgent(req.headers.get('user-agent'));
      return Response.json(
        await exchangePair(
          verifier,
          undefined,
          `Extension · ${agent} · paired ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        ),
      );
    }),
  );
}
