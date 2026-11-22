import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, type Database } from '../../src/server/db';
import {
  checklist,
  completeSetup,
  dismissChecklist,
  needsWelcome,
} from '../../src/server/services/onboarding-setup';

async function setup() {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  await db.query(
    `INSERT INTO "user"(id,name,email,email_verified) VALUES('new','New','new@example.invalid',true),('old','Old','old@example.invalid',true)`,
  );
  // 'new' signed up after samples existed; 'old' predates them.
  await db.query(
    `INSERT INTO sample_seed(user_id,keys) VALUES('new',ARRAY['welcome','wiki-maps','python-intro','sintel'])`,
  );
  const samples: Record<string, string> = {};
  for (const [pos, key] of ['welcome', 'wiki-maps', 'python-intro', 'sintel'].entries()) {
    samples[key] = randomUUID();
    await db.query(
      `INSERT INTO item(id,user_id,kind,title,url,status,sample_key,created_at) VALUES($1,'new',$2,$3,$4,'ready',$3,now()-$5*interval '1 minute')`,
      [
        samples[key],
        key === 'welcome' ? 'note' : 'article',
        key,
        key === 'welcome' ? null : `https://example.invalid/${key}`,
        pos,
      ],
    );
  }
  return { db, samples };
}
const order = async (db: Database) =>
  (
    await db.query<{ sample_key: string }>(
      `SELECT sample_key FROM item WHERE user_id='new' ORDER BY created_at DESC`,
    )
  ).rows.map((r) => r.sample_key);
const done = async (db: Database) =>
  Object.fromEntries((await checklist('new', db)).steps.map((s) => [s.id, s.done]));

test('setup runs once for new accounts and puts samples on the chosen topics first', async () => {
  const { db } = await setup();
  try {
    assert.equal(
      await needsWelcome('old', db),
      false,
      'accounts from before the sample library skip setup',
    );
    assert.equal(await needsWelcome('new', db), true);
    await assert.rejects(completeSetup('new', { persona: 'astronaut' }, db), /listed options/);
    await assert.rejects(
      completeSetup('new', { interests: ['ai', 'money', 'study', 'design'] }, db),
      /up to three/,
    );
    await completeSetup(
      'new',
      {
        persona: 'building',
        interests: ['design'],
        extension: 'skipped',
      },
      db,
    );
    assert.equal(await needsWelcome('new', db), false);
    assert.deepEqual(
      await order(db),
      ['welcome', 'sintel', 'wiki-maps', 'python-intro'],
      'welcome note first, then design samples, then the rest in their original order',
    );
    const {
      rows: [profile],
    } = await db.query<{ persona: string; interests: string[]; extension_step: string }>(
      `SELECT persona,interests,extension_step FROM onboarding_profile WHERE user_id='new'`,
    );
    assert.deepEqual(profile, {
      persona: 'building',
      interests: ['design'],
      extension_step: 'skipped',
    });
    await completeSetup('new', {}, db);
    assert.equal(await needsWelcome('new', db), false, 'skipping everything still finishes setup');
  } finally {
    await db.close();
  }
});

test('the checklist ticks steps off from what the account has done and can be dismissed', async (t) => {
  const { db, samples } = await setup();
  try {
    const first = await checklist('new', db);
    assert.equal(first.show, true);
    assert.equal(first.setupNeeded, true);
    assert.deepEqual(await done(db), {
      highlight: false,
      provider: false,
      save: false,
      extension: false,
    });
    assert.equal(first.steps.find((s) => s.id === 'provider')?.optional, true);
    process.env.AI_BASE_URL = 'http://localhost:11434/v1';
    process.env.AI_MODEL = 'fixture';
    t.after(() => {
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
    });
    assert.deepEqual(await done(db), {
      highlight: false,
      ask: false,
      save: false,
      extension: false,
    });
    assert.equal(
      first.steps.find((step) => step.id === 'highlight')?.href,
      `/read/${samples['wiki-maps']}`,
    );
    assert.equal(
      (await checklist('new', db)).steps.find((step) => step.id === 'ask')?.href,
      '/ask',
    );

    await db.query(`INSERT INTO highlight(id,user_id,item_id,quote) VALUES($1,'new',$2,'A line')`, [
      randomUUID(),
      samples['wiki-maps'],
    ]);
    const thread = randomUUID();
    await db.query(
      `INSERT INTO library_thread(id,user_id,title) VALUES($1,'new','Saved question')`,
      [thread],
    );
    await db.query(
      `INSERT INTO library_turn(id,user_id,thread_id,request_id,question,answer,state,model)
      VALUES($1,'new',$2,$3,'Question','Answer','complete','fixture')`,
      [randomUUID(), thread, randomUUID()],
    );
    await db.query(
      `INSERT INTO extension_pair(challenge,user_id) VALUES('started-not-finished','new')`,
    );
    assert.deepEqual(
      await done(db),
      { highlight: true, ask: true, save: false, extension: false },
      'an unfinished extension pairing does not count',
    );
    await db.query(`UPDATE extension_pair SET redeemed=true WHERE user_id='new'`);
    await db.query(
      `INSERT INTO item(id,user_id,kind,title,status) VALUES($1,'new','note','Mine','ready')`,
      [randomUUID()],
    );
    assert.deepEqual(await done(db), { highlight: true, ask: true, save: true, extension: true });

    assert.equal(
      (await checklist('old', db)).show,
      false,
      'older accounts never see the checklist',
    );
    await dismissChecklist('new', db);
    assert.equal((await checklist('new', db)).show, false);
  } finally {
    await db.close();
  }
});
