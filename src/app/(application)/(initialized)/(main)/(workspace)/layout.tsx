import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/auth';
import { Shell } from '@/components/shell';
import { loginPathFor, RETURN_PATH_HEADER } from '@/shared/return-path';
export const dynamic = 'force-dynamic';
export default async function Workspace({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) redirect(loginPathFor(requestHeaders.get(RETURN_PATH_HEADER)));
  return <Shell>{children}</Shell>;
}
