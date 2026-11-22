import { Readable } from 'node:stream';
import { afterInlineWork } from '@/server/jobs/inline';
import { HttpError, identity, route } from '@/server/auth/http';
import { transferLimits } from '@/server/services/transfers/limits';
import {
  listTransfers,
  processAccountTransfer,
  queueExport,
  queueImport,
} from '@/server/services/transfers/jobs';
import { importFormatSchema } from '@/server/services/transfers/legacy-import';

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const jobs = await listTransfers(userId);
    return Response.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const kind = new URL(req.url).searchParams.get('kind');
    let id: string;
    if (kind === 'export') id = await queueExport(userId);
    else if (kind === 'import') {
      const format = importFormatSchema.safeParse(new URL(req.url).searchParams.get('format'));
      if (!format.success) throw new HttpError(400, 'Choose a supported import format.');
      if (!req.body) throw new HttpError(400, 'Choose an import file.');
      if (Number(req.headers.get('content-length') ?? 0) > transferLimits().uploadBytes)
        throw new HttpError(413, 'This import file is too large.');
      const stream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
      id = await queueImport(userId, format.data, stream, undefined, req.signal);
    } else throw new HttpError(400, 'Choose import or export.');
    afterInlineWork(() => processAccountTransfer(userId));
    return Response.json({ id }, { status: 202 });
  });
}
