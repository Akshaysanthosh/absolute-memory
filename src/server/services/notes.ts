import {
  listNotesLinkingToItem,
  findEditableNote,
  findDocumentVersion,
  insertNoteRevision,
  insertNoteItem,
  updateNoteItem,
  upsertNoteDocument,
} from '@/server/repos/notes';
import { lockOwnedItem } from '@/server/repos/items';
import { reanchorHighlights } from '@/server/services/reading';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@/server/config';
import { noteReading } from '@/server/services/import/note';
import { stageReadingImages } from '@/server/services/import/images';
import { HttpError } from '@/server/auth/http';
import { getDatabase } from '@/server/db';
import { ownItem, assertItemOwner } from '@/server/services/library';
import { passagesToNoteDocument, validateNoteDocument } from '@/shared/note-document';

export async function listRelatedNotes(userId: string, id: string) {
  const db = await getDatabase();
  await assertItemOwner(userId, id, db);
  const { rows: notes } = await listNotesLinkingToItem(
    db,
    userId,
    id,
    `/read/${id}`,
    `/media/${id}`,
  );
  return notes;
}

export async function readPersonalNote(userId: string, id: string) {
  const db = await getDatabase();
  const {
    rows: [note],
  } = await findEditableNote(db, id, userId);
  if (!note) throw new HttpError(404, 'This resource was not found.');
  if (note.kind !== 'note') throw new HttpError(400, 'Only personal notes can be edited.');
  return {
    id,
    title: note.title,
    document: note.document ?? passagesToNoteDocument(note.passages),
    version: note.version ?? 0,
  };
}

export async function savePersonalNote(
  userId: string,
  input: { id?: string; title: string; document?: unknown; version: number },
) {
  const db = await getDatabase();
  let document, reading;
  try {
    document = validateNoteDocument(input.document);
    reading = noteReading(document, getConfig().APP_URL);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const text = reading.passages.map((passage) => passage.text).join('\n\n');
  if (!text.trim() && !reading.images.length)
    throw new HttpError(400, 'Write something before saving your note.');
  if (text.length > 100000) throw new HttpError(413, 'Keep notes below 100,000 characters.');
  const id = input.id ?? randomUUID();
  if (input.id) await assertItemOwner(userId, id, db);
  const staged = await stageReadingImages(db, userId, id, reading.html, reading.images);
  return db.transaction(async (tx) => {
    if (input.id) {
      await lockOwnedItem(tx, id, userId);
      const item = await ownItem(userId, id, tx);
      if (item.kind !== 'note') throw new HttpError(400, 'Only personal notes can be edited.');
      const previous = (await findDocumentVersion(tx, id)).rows[0];
      if ((previous?.version || 0) !== input.version)
        throw new HttpError(
          409,
          'This note changed in another window. Your draft is still here; reopen the note to get the latest version.',
        );
      await insertNoteRevision(
        tx,
        id,
        input.version,
        item.title,
        JSON.stringify(previous?.document || passagesToNoteDocument(item.passages)),
      );
    } else {
      await insertNoteItem(tx, id, userId, input.title);
    }
    await updateNoteItem(
      tx,
      id,
      userId,
      input.title,
      JSON.stringify(reading.passages),
      text.slice(0, 300),
      text.trim().split(/\s+/).filter(Boolean).length,
      staged.html,
    );
    await staged.attach(tx);
    if (input.id) await reanchorHighlights(tx, userId, id, reading.passages);
    const version = input.version + 1;
    await upsertNoteDocument(tx, id, JSON.stringify(document), version);
    return { id, version };
  });
}
