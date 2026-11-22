import type { Queryable } from '@/server/db';
import type { Passage } from '@/shared/passages';

export function listNotesLinkingToItem(
  db: Queryable,
  userId: string,
  id: string,
  readerPath: string,
  mediaPath: string,
) {
  return db.query<{ id: string; title: string }>(
    `
   SELECT i.id,i.title FROM item i
   WHERE i.user_id=$1 AND i.kind='note' AND i.id<>$2 AND NOT i.archived
     AND EXISTS (
      SELECT 1 FROM note_document n WHERE n.item_id=i.id AND jsonb_path_exists(n.document,
        '$.**.marks[*] ? (@.type == "link" && (@.attrs.href == $reading || @.attrs.href == $media))',
        jsonb_build_object('reading',$3::text,'media',$4::text))
     )
   ORDER BY i.updated_at DESC LIMIT 100`,
    [userId, id, readerPath, mediaPath],
  );
}

export function findEditableNote(db: Queryable, id: string, userId: string) {
  return db.query<{
    kind: string;
    title: string;
    passages: Passage[];
    document: unknown;
    version: number | null;
  }>(
    `SELECT i.kind,i.title,i.passages,n.document,n.version FROM item i
     LEFT JOIN note_document n ON n.item_id=i.id WHERE i.id=$1 AND i.user_id=$2`,
    [id, userId],
  );
}

export function findDocumentVersion(db: Queryable, id: string) {
  return db.query<{ version: number; document: unknown }>(
    'SELECT version,document FROM note_document WHERE item_id=$1',
    [id],
  );
}

export function insertNoteRevision(
  db: Queryable,
  id: string,
  version: number,
  title: string,
  documentJson: string,
) {
  return db.query(
    'INSERT INTO note_revision(item_id,version,title,document) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING',
    [id, version, title, documentJson],
  );
}

export function insertNoteItem(db: Queryable, id: string, userId: string, title: string) {
  return db.query("INSERT INTO item(id,user_id,kind,title) VALUES($1,$2,'note',$3)", [
    id,
    userId,
    title,
  ]);
}

export function updateNoteItem(
  db: Queryable,
  id: string,
  userId: string,
  title: string,
  passagesJson: string,
  excerpt: string,
  words: number,
  html: string,
) {
  return db.query(
    `UPDATE item SET title=$3,passages=$4::jsonb,excerpt=$5,words=$6,reading_html=$7,updated_at=now()
    WHERE id=$1 AND user_id=$2`,
    [id, userId, title, passagesJson, excerpt, words, html],
  );
}

export function upsertNoteDocument(
  db: Queryable,
  id: string,
  documentJson: string,
  version: number,
) {
  return db.query(
    'INSERT INTO note_document(item_id,document,version) VALUES($1,$2::jsonb,$3) ON CONFLICT(item_id) DO UPDATE SET document=$2::jsonb,version=$3,updated_at=now()',
    [id, documentJson, version],
  );
}
