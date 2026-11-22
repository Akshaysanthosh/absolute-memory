import type { Queryable } from '@/server/db';
import type { KnowledgeSource } from '@/shared/knowledge/shared';

export function listConversationThreads(db: Queryable, userId: string) {
  return db.query(
    'SELECT id,title,created_at FROM library_thread WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
    [userId],
  );
}

export function checkpointConversationTurn(
  db: Queryable,
  id: string,
  userId: string,
  answer: string,
  sourcesJson: string,
) {
  return db.query(
    'UPDATE library_turn SET answer=$3,sources=$4::jsonb WHERE id=$1 AND user_id=$2',
    [id, userId, answer, sourcesJson],
  );
}

export function finishConversationTurn(
  db: Queryable,
  id: string,
  userId: string,
  answer: string,
  state: string,
  sourcesJson: string,
  inputTokens: number,
  outputTokens: number,
) {
  return db.query(
    'UPDATE library_turn SET answer=$3,state=$4,sources=$5::jsonb,input_tokens=$6,output_tokens=$7,finished_at=now() WHERE id=$1 AND user_id=$2',
    [id, userId, answer, state, sourcesJson, inputTokens, outputTokens],
  );
}

export function findConversation(db: Queryable, id: string, userId: string) {
  return db.query('SELECT id,title FROM library_thread WHERE id=$1 AND user_id=$2', [id, userId]);
}

export function listConversationTurns(db: Queryable, threadId: string, userId: string) {
  return db.query<{
    id: string;
    question: string;
    answer: string;
    state: string;
    sources: KnowledgeSource[];
    created_at: string;
  }>(
    'SELECT id,question,answer,state,sources,created_at FROM library_turn WHERE thread_id=$1 AND user_id=$2 ORDER BY created_at',
    [threadId, userId],
  );
}

export function deleteConversation(db: Queryable, id: string, userId: string) {
  return db.query('DELETE FROM library_thread WHERE id=$1 AND user_id=$2', [id, userId]);
}

export function findTurnToSave(db: Queryable, id: string, threadId: string, userId: string) {
  return db.query<{
    question: string;
    answer: string;
    state: string;
    sources: KnowledgeSource[];
  }>(
    'SELECT question,answer,state,sources FROM library_turn WHERE id=$1 AND thread_id=$2 AND user_id=$3',
    [id, threadId, userId],
  );
}

export function findRunningTurn(db: Queryable, userId: string) {
  return db.query(
    `SELECT id FROM library_turn WHERE user_id=$1 AND state='running' AND created_at>now()-interval '3 minutes'`,
    [userId],
  );
}

export function findTurnByRequest(db: Queryable, userId: string, requestId: string) {
  return db.query('SELECT id FROM library_turn WHERE user_id=$1 AND request_id=$2', [
    userId,
    requestId,
  ]);
}

export function findOwnedThreadId(db: Queryable, userId: string, id: string) {
  return db.query('SELECT id FROM library_thread WHERE user_id=$1 AND id=$2', [userId, id]);
}

export function insertConversationThread(
  db: Queryable,
  threadId: string,
  userId: string,
  title: string,
) {
  return db.query('INSERT INTO library_thread(id,user_id,title) VALUES($1,$2,$3)', [
    threadId,
    userId,
    title,
  ]);
}

export function listConversationHistory(db: Queryable, threadId: string, userId: string) {
  return db.query<{ question: string; answer: string; state: string }>(
    'SELECT question,answer,state FROM library_turn WHERE thread_id=$1 AND user_id=$2 ORDER BY created_at',
    [threadId, userId],
  );
}

export function insertConversationTurn(
  db: Queryable,
  id: string,
  userId: string,
  threadId: string,
  requestId: string,
  question: string,
  web: boolean,
  model: string,
) {
  return db.query(
    'INSERT INTO library_turn(id,user_id,thread_id,request_id,question,web,model) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [id, userId, threadId, requestId, question, web, model],
  );
}
