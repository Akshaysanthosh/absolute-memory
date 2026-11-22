import { getConfig } from '../src/server/config';
import { createDatabase } from '../src/server/db';
import { migrate } from '../src/server/db/migrations';

async function main() {
  const db = await createDatabase(getConfig().DATABASE_URL, false);
  try {
    await migrate(db);
    console.log('Absolute Memory database is ready.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('Migration failed.', error instanceof Error ? error.name : 'Unknown error');
  process.exitCode = 1;
});
