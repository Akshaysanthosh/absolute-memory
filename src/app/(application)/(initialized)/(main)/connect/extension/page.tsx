import { headers } from 'next/headers';
import Link from 'next/link';
import { getAuth } from '@/server/auth/auth';
import { ExtensionPair } from '@/components/extension-pair';
import { Brand } from '@/components/brand';
export const metadata = { title: 'Connect extension · Absolute Memory' };
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { challenge } = await searchParams,
    valid = typeof challenge === 'string' && /^[a-f0-9]{64}$/.test(challenge);
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const next = valid ? '/connect/extension?challenge=' + challenge : '/settings?section=extension';
  return (
    <main className="pair-page">
      <Link href="/library">
        <Brand />
      </Link>
      {!valid ? (
        <section className="settings-card">
          <h1>Start from the extension.</h1>
          <p>
            Open the Absolute Memory extension’s options and select “Connect to Absolute Memory” to
            create a connection request.
          </p>
          <Link className="button primary" href="/settings?section=extension">
            Installation instructions
          </Link>
        </section>
      ) : !session ? (
        <section className="settings-card">
          <h1>A home for your next good read.</h1>
          <p>Sign in to choose the library this browser saves to.</p>
          <Link className="button primary" href={'/login?next=' + encodeURIComponent(next)}>
            Sign in to connect Chrome
          </Link>
        </section>
      ) : (
        <ExtensionPair challenge={challenge!} name={session.user.name} />
      )}
    </main>
  );
}
