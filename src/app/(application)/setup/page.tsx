import { redirect } from 'next/navigation';
import { SetupAccountForm } from '@/components/setup-account-form';
import { instanceOwner } from '@/server/services/instance';
import '@/components/setup-flow.css';

export const metadata = { title: 'Instance setup · Absolute Memory' };
export const dynamic = 'force-dynamic';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const initialized = Boolean(await instanceOwner());
  const { mode } = await searchParams;
  if (initialized && mode !== 'invite') redirect('/login');
  return <SetupAccountForm invited={initialized} />;
}
