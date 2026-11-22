import { getDatabase } from '@/server/db';
import { countLibraryBuckets, listActiveTopics } from '@/server/repos/library-metadata';
import { listLibraryOptions } from '@/server/repos/library-options';
import { libraryRevision } from '@/server/repos/library-revision';

export async function getLibraryCounts(userId: string) {
  const rows = await countLibraryBuckets(await getDatabase(), userId);
  return Object.fromEntries(rows.map((row) => [row.bucket, Number(row.count)]));
}

export async function getLibraryTopics(userId: string) {
  return listActiveTopics(await getDatabase(), userId);
}

export async function getLibraryRevision(userId: string) {
  return libraryRevision(userId, await getDatabase());
}

export async function getLibraryOptions(userId: string, cursor: string | null) {
  return listLibraryOptions(userId, await getDatabase(), cursor);
}
