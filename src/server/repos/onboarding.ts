import type { Queryable } from '@/server/db';

export async function needsSampleSetup(db: Queryable, userId: string) {
  const {
    rows: [row],
  } = await db.query<{ needed: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sample_seed WHERE user_id=$1)
        AND NOT EXISTS(SELECT 1 FROM onboarding_profile WHERE user_id=$1 AND setup_completed_at IS NOT NULL) AS needed`,
    [userId],
  );
  return Boolean(row?.needed);
}

export async function storeSetupAnswers(
  db: Queryable,
  userId: string,
  answers: { persona: string | null; interests: string[]; extension: string | null },
) {
  const { persona, interests, extension } = answers;
  await db.query(
    `INSERT INTO onboarding_profile(user_id,persona,interests,extension_step,setup_completed_at)
      VALUES($1,$2,$3::text[],$4,now())
      ON CONFLICT(user_id) DO UPDATE SET persona=EXCLUDED.persona,interests=EXCLUDED.interests,
        extension_step=EXCLUDED.extension_step,setup_completed_at=COALESCE(onboarding_profile.setup_completed_at,now()),updated_at=now()`,
    [userId, persona, interests, extension],
  );
}

export async function listOrderedSamples(db: Queryable, userId: string) {
  const { rows } = await db.query<{ id: string; sample_key: string }>(
    'SELECT id,sample_key FROM item WHERE user_id=$1 AND sample_key IS NOT NULL ORDER BY created_at DESC',
    [userId],
  );
  return rows;
}

export async function setSampleOrder(db: Queryable, userId: string, ids: string[]) {
  // Only samples move; created_at is not part of what triggers re-organization.
  await db.query(
    `UPDATE item i SET created_at=now()-o.pos*interval '1 minute'
      FROM unnest($2::uuid[],$3::int[]) AS o(id,pos) WHERE i.id=o.id AND i.user_id=$1`,
    [userId, ids, ids.map((_, index) => index)],
  );
}

export async function readChecklistProgress(db: Queryable, userId: string) {
  const {
    rows: [row],
  } = await db.query<{
    seeded: boolean;
    dismissed: boolean;
    completed: boolean;
    highlight: boolean;
    ask: boolean;
    save: boolean;
    extension: boolean;
    sample: string | null;
  }>(
    `SELECT EXISTS(SELECT 1 FROM sample_seed WHERE user_id=$1) AS seeded,
      EXISTS(SELECT 1 FROM onboarding_profile WHERE user_id=$1 AND checklist_dismissed_at IS NOT NULL) AS dismissed,
      EXISTS(SELECT 1 FROM onboarding_profile WHERE user_id=$1 AND setup_completed_at IS NOT NULL) AS completed,
      EXISTS(SELECT 1 FROM highlight WHERE user_id=$1) AS highlight,
      EXISTS(SELECT 1 FROM library_turn WHERE user_id=$1 AND state='complete') AS ask,
      EXISTS(SELECT 1 FROM item WHERE user_id=$1 AND sample_key IS NULL) AS save,
      (EXISTS(SELECT 1 FROM extension_pair WHERE user_id=$1 AND redeemed) OR EXISTS(SELECT 1 FROM capture_token WHERE user_id=$1)
        OR EXISTS(SELECT 1 FROM item WHERE user_id=$1 AND channel='extension')) AS extension,
      (SELECT i.id::text FROM item i WHERE i.user_id=$1 AND i.sample_key IS NOT NULL AND i.kind='article'
         AND NOT EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=i.id)
         ORDER BY (i.sample_key='wiki-maps') DESC, i.created_at DESC LIMIT 1) AS sample`,
    [userId],
  );
  return row;
}

export async function markChecklistDismissed(db: Queryable, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO onboarding_profile(user_id,checklist_dismissed_at) VALUES($1,now())
    ON CONFLICT(user_id) DO UPDATE SET checklist_dismissed_at=now(),updated_at=now()`,
    [userId],
  );
}
