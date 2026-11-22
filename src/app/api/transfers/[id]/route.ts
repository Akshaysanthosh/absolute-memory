import { identity, route } from '@/server/auth/http';
import { zipDownload } from '@/server/http/zip-download';
import { downloadTransfer } from '@/server/services/transfers/jobs';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(req);
    const { id } = await ctx.params;
    return zipDownload(await downloadTransfer(userId, id));
  });
}
