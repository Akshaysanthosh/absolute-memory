import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AskWorkspace } from '@/components/ask-workspace';
import { getAuth } from '@/server/auth/auth';
import { configuredCapabilities } from '@/server/services/capabilities';
import { loginPathFor, RETURN_PATH_HEADER } from '@/shared/return-path';

export default async function AskPage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) redirect(loginPathFor(requestHeaders.get(RETURN_PATH_HEADER)));
  return <AskWorkspace enabled={configuredCapabilities().ai} />;
}
