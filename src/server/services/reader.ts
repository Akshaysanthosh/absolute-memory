import { getDatabase } from '@/server/db';
import { ownItem } from '@/server/services/library';
import { attachMediaReadiness } from '@/server/services/media/readiness';

export async function loadReaderItem(userId: string, itemId: string) {
  const db = await getDatabase();
  const [item] = await attachMediaReadiness([await ownItem(userId, itemId, db)], userId, db);
  return item;
}
