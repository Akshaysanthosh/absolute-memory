import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/auth';
import { loginPathFor, RETURN_PATH_HEADER } from '@/shared/return-path';
import { needsWelcome } from '@/server/services/onboarding-setup';
import { SetupFlow } from '@/components/setup-flow';

export const metadata = { title: 'Welcome · Absolute Memory' };
export const dynamic = 'force-dynamic';

/** First-run setup: four short, skippable screens between sign-up and the library. */
export default async function WelcomePage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) redirect(loginPathFor(requestHeaders.get(RETURN_PATH_HEADER)));
  if (!(await needsWelcome(session.user.id))) redirect('/library');
  return <SetupFlow name={session.user.name?.split(' ')[0] || ''} />;
}
