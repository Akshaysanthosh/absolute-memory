import { z } from 'zod';
import { issuePasswordResetLink } from '../../src/server/auth/auth';
import { getDatabase } from '../../src/server/db';

async function main() {
  const email = z.email().parse(process.argv[2]?.trim().toLowerCase());
  const db = await getDatabase();
  try {
    const url = await issuePasswordResetLink(email);
    if (!url) throw new Error('No account found for that address.');
    console.log(url);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Could not create a password reset link.');
  process.exitCode = 1;
});
