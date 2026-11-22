import { findUserByEmail } from '@/server/repos/users';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { getDatabase } from '../../src/server/db';
import { transferLimits } from '../../src/server/services/transfers/limits';
import {
  listTransfers,
  processTransfer,
  queueImport,
} from '../../src/server/services/transfers/jobs';
import { importFormatSchema } from '../../src/server/services/transfers/legacy-import';

async function main() {
  const { values, positionals } = parseArgs({
    options: { format: { type: 'string' }, user: { type: 'string' } },
    allowPositionals: true,
  });
  if (positionals.length !== 1 || !values.format || !values.user)
    throw new Error('Use import <file> --format <format> --user <email>.');
  const [file] = positionals;
  const format = importFormatSchema.parse(values.format);
  const email = z.email().parse(values.user.trim().toLowerCase());
  const info = await stat(file);
  if (!info.isFile() || info.size > transferLimits().uploadBytes)
    throw new Error('Choose a file within the import limit.');
  const db = await getDatabase();
  try {
    const {
      rows: [user],
    } = await findUserByEmail(db, email);
    if (!user) throw new Error('No account matches that email.');
    const id = await queueImport(user.id, format, createReadStream(file), db);
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      await processTransfer(db, user.id);
      const job = (await listTransfers(user.id, db)).find((row) => row.id === id);
      if (!job) throw new Error('The import status is unavailable.');
      if (job.state === 'ready') {
        console.log(JSON.stringify(job));
        return;
      }
      if (job.state === 'failed') throw new Error(String(job.error || 'The import failed.'));
      await setTimeout(500);
    }
    console.log(JSON.stringify({ id, state: 'queued' }));
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'The import failed.');
  process.exitCode = 1;
});
