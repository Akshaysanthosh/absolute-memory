import { getConfig } from '@/server/config';
import { getDatabase, type Database } from '@/server/db';
import { HttpError } from '@/server/auth/http';
import {
  findActiveToken,
  touchIntegrationToken,
  type IntegrationScope,
} from '@/server/repos/integration-tokens';
import { enforceInvalidKeyRateLimit, enforceRateLimit } from '@/server/security/rate-limit';
import { tokenHash } from '@/server/security/token-hash';

export function requireIntegrations() {
  if (!getConfig().INTEGRATION_API_ENABLED)
    throw new HttpError(404, 'Integration API is unavailable.');
}

export async function integrationIdentity(
  req: Request,
  scope: IntegrationScope,
  database?: Database,
) {
  const db = database ?? (await getDatabase());
  const token = /^Bearer (am_[A-Za-z0-9_-]{43})$/i.exec(
    req.headers.get('authorization') || '',
  )?.[1];
  const key = token ? await findActiveToken(db, tokenHash(token)) : undefined;
  if (!key) {
    await enforceInvalidKeyRateLimit(req, db);
    throw new HttpError(
      401,
      token
        ? 'This personal API key is invalid, expired or revoked.'
        : 'A personal API key is required.',
    );
  }
  if (!key.scopes.includes(scope))
    throw new HttpError(403, 'This personal API key does not have the required permission.');
  await enforceRateLimit('integration', key.user_id, db);
  if (scope === 'library:write') await enforceRateLimit('capture', key.user_id, db);
  await touchIntegrationToken(db, key);
  return key;
}
