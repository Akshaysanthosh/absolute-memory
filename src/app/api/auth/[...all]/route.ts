import { z } from 'zod';
import { body, route } from '@/server/auth/http';
import { getAuth } from '@/server/auth/auth';
import {
  enforceAuthAddress,
  enforceEmailRateLimit,
  enforceRateLimit,
} from '@/server/security/rate-limit';

export const runtime = 'nodejs';

const emailPaths = {
  '/api/auth/sign-in/email': 'auth-sign-in',
  '/api/auth/request-password-reset': 'auth-reset',
  '/api/auth/sign-up/email': 'auth-setup',
} as const;
const emailBody = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) });
const resetBody = z.object({ token: z.string().max(256).optional() });

export async function GET(request: Request) {
  return (await getAuth()).handler(request);
}

export function POST(request: Request) {
  return route(async () => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    const encoding =
      request.headers.get('content-type')?.split(';')[0].trim() ===
      'application/x-www-form-urlencoded'
        ? 'form'
        : 'json';
    try {
      if (Object.hasOwn(emailPaths, path)) {
        const { email } = await body(request.clone(), emailBody, 8_192, encoding);
        await enforceEmailRateLimit(emailPaths[path as keyof typeof emailPaths], email);
        await enforceAuthAddress(request);
      } else if (path === '/api/auth/reset-password') {
        const { token } = await body(request.clone(), resetBody, 8_192, encoding);
        const subject = token ?? url.searchParams.get('token');
        if (subject && subject.length <= 256) await enforceRateLimit('auth-reset-token', subject);
        await enforceAuthAddress(request);
      }
    } catch (error) {
      void request.body?.cancel().catch(() => {});
      throw error;
    }
    return (await getAuth()).handler(request);
  });
}
