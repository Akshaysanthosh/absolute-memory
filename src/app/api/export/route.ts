import { identity, route } from '@/server/auth/http';
import { zipDownload } from '@/server/http/zip-download';
import { exportLibrary } from '@/server/services/transfers/export';

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    return zipDownload(await exportLibrary(userId));
  });
}
