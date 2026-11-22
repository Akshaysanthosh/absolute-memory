import { HttpError } from '@/server/auth/http';
import { getDatabase } from '@/server/db';
import { findActiveTopic, readTopicPage, upsertTopicPage } from '@/server/repos/library-metadata';

export async function getTopicPage(userId: string, topic: string) {
  const { rows } = await readTopicPage(await getDatabase(), userId, topic);
  return rows[0] || null;
}

export async function saveTopicPage(userId: string, topic: string, overview: string) {
  const db = await getDatabase();
  const found = await findActiveTopic(db, userId, topic);
  if (!found.rows.length) throw new HttpError(404, 'Topic not found in your active library.');
  await upsertTopicPage(db, userId, topic, overview);
}
