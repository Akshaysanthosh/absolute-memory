import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import type { Database } from '../../src/server/db';
import type { StorageProvider } from '../../src/server/providers';
import { storeOriginal } from '../../src/server/services/document-assets';

export function configureTemporaryStorage() {
  const directory = mkdtempSync(join(tmpdir(), 'absolute-memory-test-'));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  after(() => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

export async function attachTestDocument(
  db: Database,
  owner: string,
  id: string,
  data: Uint8Array,
  name: string,
  mime: string,
  storage?: StorageProvider,
) {
  const attach = await storeOriginal(
    db,
    owner,
    id,
    { data, name, mime, pages: 1, method: 'test' },
    storage,
  );
  await db.transaction(attach);
}
