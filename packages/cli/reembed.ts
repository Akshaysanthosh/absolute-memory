import { getDatabase } from '../../src/server/db';
import { reembed } from '../../src/server/services/embeddings';

async function main() {
  const db = await getDatabase();
  try {
    const profile = await reembed(db);
    console.log(JSON.stringify(profile));
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Could not rebuild embeddings.');
  process.exitCode = 1;
});
