import '@fontsource-variable/bricolage-grotesque';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/auth';
import { loginReturnPath } from '@/shared/return-path';
import { authConfiguration } from '@/server/auth/auth-config';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import {
  AbsoluteMark,
  PdfIcon,
  PodcastIcon,
  XIcon,
  YouTubeIcon,
} from '@/components/home/source-icons';
import s from './login.module.css';
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return {
    title:
      mode === 'signup' ? 'Create your account · Absolute Memory' : 'Sign in · Absolute Memory',
  };
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string | string[] }>;
}) {
  const { mode, next, error } = await searchParams;
  // Already signed in (e.g. arriving from Sign in / Start free on the website): skip the form.
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (session) redirect(loginReturnPath(next));
  const config = authConfiguration();
  const signup = config.allowSignup && mode === 'signup';
  return (
    <main className={s.page}>
      <section className={s.story} aria-labelledby="login-story-title">
        <Link href="/" className={s.brand} aria-label="Absolute Memory home">
          <AbsoluteMark ink="#FFFDF7" />
          absolute memory
        </Link>
        <h1 id="login-story-title" className={s.headline}>
          Everything you save, <span>connected.</span>
        </h1>
        <p className={s.sub}>
          {signup
            ? 'Set up a library for the things you want to keep.'
            : 'Your library, reader and connections are right where you left them.'}
        </p>
        <div className={s.dots} aria-hidden="true">
          <svg className={s.lines} viewBox="0 0 100 100" preserveAspectRatio="none">
            <g stroke="#FFFDF7" strokeWidth="3" strokeLinecap="round" fill="none">
              <line x1="22" y1="24" x2="52" y2="50" vectorEffect="non-scaling-stroke" />
              <line x1="80" y1="22" x2="52" y2="50" vectorEffect="non-scaling-stroke" />
              <line x1="24" y1="80" x2="52" y2="50" vectorEffect="non-scaling-stroke" />
              <line x1="80" y1="80" x2="52" y2="50" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <div className={s.dot} style={{ left: '22%', top: '24%', background: 'var(--sun)' }}>
            <YouTubeIcon size={24} />
            Video
          </div>
          <div className={s.dot} style={{ left: '80%', top: '22%', background: 'var(--sky)' }}>
            <XIcon size={22} />
            Thread
          </div>
          <div className={s.dot} style={{ left: '24%', top: '80%', background: 'var(--mint)' }}>
            <PdfIcon size={24} />
            PDF
          </div>
          <div className={s.dot} style={{ left: '80%', top: '80%', background: '#fff' }}>
            <PodcastIcon size={24} />
            Podcast
          </div>
          <div className={s.hub}>connected.</div>
        </div>
        <ul className={s.steps} aria-label="What you can do">
          <li>save.</li>
          <li>read.</li>
          <li>ask.</li>
          <li>connect.</li>
        </ul>
      </section>
      <section className={s.panel} aria-label={signup ? 'Create your account' : 'Sign in'}>
        <Link href="/" className={s.back}>
          ← Home
        </Link>
        <div className={s.formWrap}>
          <AuthForm
            returnTo={loginReturnPath(next)}
            initialSignup={signup}
            allowSignup={config.allowSignup}
            emailReset={config.emailReset}
            googleEnabled={config.google}
            githubEnabled={config.github}
            oauthError={
              Array.isArray(error)
                ? error.find((value) => value === 'account_not_linked') || error[0]
                : error
            }
          />
        </div>
      </section>
    </main>
  );
}
