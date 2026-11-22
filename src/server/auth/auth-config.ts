import { getConfig } from '@/server/config';

export function authConfiguration() {
  const config = getConfig();
  return {
    baseURL: config.APP_URL,
    allowSignup: config.ALLOW_SIGNUP,
    emailReset: Boolean(config.SMTP_URL),
    google: Boolean(config.GOOGLE_CLIENT_ID),
    github: Boolean(config.GITHUB_CLIENT_ID),
  };
}
