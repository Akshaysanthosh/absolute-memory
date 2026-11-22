import { headers } from 'next/headers';
import { getAuth } from '@/server/auth/auth';
import { AppThemeProvider } from '@/components/app-theme';
import { LibrarySessionProvider } from '@/components/library-session';
import { ApplicationSurface } from '@/components/application-surface';
import { OnboardingTip } from '@/components/onboarding-tip';
import { APP_THEME_BOOT } from '@/shared/app-theme';
import { SURFACE_BOOT } from '@/shared/application-surface';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@/components/theme-switch.css';
import '@/components/reading-fonts.css';

export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  return (
    <html lang="en" data-app-theme="dark" suppressHydrationWarning>
      <head>
        <script
          nonce={requestHeaders.get('x-nonce') ?? undefined}
          dangerouslySetInnerHTML={{ __html: APP_THEME_BOOT + SURFACE_BOOT }}
        />
      </head>
      <body>
        <AppThemeProvider showAppearance={false}>
          <LibrarySessionProvider key={session?.user.id || 'signed-out'} enabled={!!session}>
            <ApplicationSurface>{children}</ApplicationSurface>
            {session && <OnboardingTip />}
          </LibrarySessionProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
