import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getConfig } from '@/server/config';
import { getDatabase } from '@/server/db';
import * as schema from '@/server/db/auth-schema';
import { getPasswordResetSender } from '@/server/providers';
import { ownerId } from '@/server/repos/instance';
import { seedNewAccount } from '@/server/services/samples/seed';

async function sessionSecret() {
  const { AUTH_SECRET, DATA_DIR } = getConfig();
  if (AUTH_SECRET) return AUTH_SECRET;

  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const file = join(DATA_DIR, 'auth-secret');
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }

  const value = randomBytes(48).toString('base64url');
  try {
    await writeFile(file, value, { mode: 0o600, flag: 'wx' });
    return value;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    return readFile(file, 'utf8');
  }
}

type ResetSender = (email: string, url: string) => Promise<void>;

async function createAuth(resetSender?: ResetSender) {
  const db = await getDatabase();
  const config = getConfig();
  const { APP_URL, ALLOW_SIGNUP } = config;
  const sendReset = resetSender ?? getPasswordResetSender();

  return betterAuth({
    appName: 'Absolute Memory',
    logger: { disabled: true },
    secret: await sessionSecret(),
    baseURL: APP_URL,
    advanced: {
      useSecureCookies: APP_URL.startsWith('https:'),
      ipAddress: {
        disableIpTracking: !config.TRUST_PROXY,
        ipAddressHeaders: config.TRUST_PROXY ? ['x-real-ip'] : [],
      },
    },
    trustedOrigins:
      config.NODE_ENV === 'production'
        ? [APP_URL]
        : [APP_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    database: drizzleAdapter(db.orm, { provider: 'pg', schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !ALLOW_SIGNUP,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      ...(sendReset ? { sendResetPassword: ({ user, url }) => sendReset(user.email, url) } : {}),
    },
    socialProviders: {
      ...(config.GOOGLE_CLIENT_ID
        ? {
            google: {
              clientId: config.GOOGLE_CLIENT_ID,
              clientSecret: config.GOOGLE_CLIENT_SECRET!,
              disableSignUp: !ALLOW_SIGNUP,
            },
          }
        : {}),
      ...(config.GITHUB_CLIENT_ID
        ? {
            github: {
              clientId: config.GITHUB_CLIENT_ID,
              clientSecret: config.GITHUB_CLIENT_SECRET!,
              disableSignUp: !ALLOW_SIGNUP,
            },
          }
        : {}),
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          if ((await ownerId(db)) === user.id) {
            throw new APIError('FORBIDDEN', {
              message: 'The instance owner account cannot be deleted.',
            });
          }
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            if (!ALLOW_SIGNUP || !(await ownerId(db))) {
              throw new APIError('FORBIDDEN', {
                message: 'Registration is closed. Ask the owner to invite you.',
              });
            }
          },
          after: async (user) => {
            await seedNewAccount(db, user.id);
          },
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, freshAge: 300 },
    rateLimit: {
      enabled: true,
      storage: db.driver === 'postgres' ? 'database' : 'memory',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 4 },
      },
    },
  });
}

const state = globalThis as typeof globalThis & { amAuth?: ReturnType<typeof createAuth> };

export function getAuth() {
  state.amAuth ??= createAuth().catch((error) => {
    delete state.amAuth;
    throw error;
  });
  return state.amAuth;
}

export async function issuePasswordResetLink(email: string) {
  let link: string | undefined;
  const auth = await createAuth(async (_email, url) => {
    link = url;
  });
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: new URL('/reset-password', getConfig().APP_URL).href },
  });
  return link;
}
