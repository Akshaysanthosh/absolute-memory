import { headers } from 'next/headers';
import { getCapabilities } from '@/server/services/capabilities';
import { getAuth } from '@/server/auth/auth';
import { authConfiguration } from '@/server/auth/auth-config';
import { instanceOwner } from '@/server/services/instance';
import { getConfig } from '@/server/config';
import { SettingsView } from '@/components/settings-view';
import { settingsSections } from '@/shared/settings-sections';

export const metadata = { title: 'Settings · Absolute Memory' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; section?: string | string[] }>;
}) {
  const { error, section } = await searchParams;
  const config = getConfig();
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const [owner, capabilities] = await Promise.all([
    instanceOwner(),
    getCapabilities(session?.user.id),
  ]);
  const isOwner = session?.user.id === owner;
  const requested = section === 'integrations' ? 'keys' : section === 'data' ? 'export' : section;
  const selected =
    settingsSections.find(
      ([id]) =>
        id === requested &&
        (id !== 'invites' || isOwner) &&
        (id !== 'keys' || config.INTEGRATION_API_ENABLED),
    )?.[0] ?? 'account';
  return (
    <SettingsView
      key={selected}
      initialSection={selected}
      googleEnabled={authConfiguration().google}
      linkingFailed={!!error}
      integrationsEnabled={config.INTEGRATION_API_ENABLED}
      isOwner={isOwner}
      capabilities={capabilities}
      appUrl={config.APP_URL}
    />
  );
}
