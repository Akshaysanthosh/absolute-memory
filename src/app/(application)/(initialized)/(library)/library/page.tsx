import { getCapabilities } from '@/server/services/capabilities';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/auth';
import { loginPathFor, RETURN_PATH_HEADER } from '@/shared/return-path';
import { LibraryWorkspace } from '@/components/library-workspace';
import { needsWelcome } from '@/server/services/onboarding-setup';

export default async function LibraryPage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) redirect(loginPathFor(requestHeaders.get(RETURN_PATH_HEADER)));
  // A new account goes through the short setup screens once before its first library visit.
  if (await needsWelcome(session.user.id)) redirect('/welcome');
  return <LibraryWorkspace capabilities={await getCapabilities()} />;
}
