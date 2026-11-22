import {
  listOrderedSamples,
  markChecklistDismissed,
  needsSampleSetup,
  readChecklistProgress,
  setSampleOrder,
  storeSetupAnswers,
} from '@/server/repos/onboarding';
import { configuredCapabilities } from '@/server/services/capabilities';
import { getDatabase } from '@/server/db';
import type { Database, Queryable } from '@/server/db';
import { HttpError } from '@/server/auth/http';
import { SAMPLE_CATALOG } from '@/server/services/samples/catalog';
import { PERSONAS, TOPICS, type Checklist, type ChecklistStep } from '@/shared/onboarding-options';
export * from '@/shared/onboarding-options';

/** Setup runs once, for accounts that started with the sample library (new sign-ups), until finished or skipped. */
export async function needsWelcome(userId: string, db?: Queryable): Promise<boolean> {
  return needsSampleSetup(db ?? (await getDatabase()), userId);
}

/**
 * Saves the setup answers (all optional) and puts the samples that match the chosen topics at the top
 * of the library, right after the welcome note.
 */
export async function completeSetup(
  userId: string,
  input: { persona?: unknown; interests?: unknown; extension?: unknown },
  db?: Pick<Database, 'transaction'>,
): Promise<void> {
  const persona = input.persona == null ? null : PERSONAS.find((p) => p.id === input.persona)?.id;
  if (persona === undefined) throw new HttpError(400, 'Choose one of the listed options.');
  const interests = Array.isArray(input.interests) ? input.interests : [];
  if (interests.length > 3 || interests.some((t) => !TOPICS.some((topic) => topic.id === t)))
    throw new HttpError(400, 'Choose up to three of the listed topics.');
  const extension =
    input.extension == null
      ? null
      : (['installed', 'skipped', 'not-offered'] as const).find((s) => s === input.extension);
  if (extension === undefined) throw new HttpError(400, 'Invalid extension step.');
  await (db ?? (await getDatabase())).transaction(async (tx) => {
    await storeSetupAnswers(tx, userId, { persona, interests, extension });
    if (!interests.length) return;
    const topicsOf = new Map(SAMPLE_CATALOG.map((entry) => [entry.key, entry.topics as string[]]));
    const rows = await listOrderedSamples(tx, userId);
    const matches = (key: string) =>
      (topicsOf.get(key) ?? []).some((topic) => interests.includes(topic));
    const ordered = [
      ...rows.filter((r) => r.sample_key === 'welcome'),
      ...rows.filter((r) => r.sample_key !== 'welcome' && matches(r.sample_key)),
      ...rows.filter((r) => r.sample_key !== 'welcome' && !matches(r.sample_key)),
    ];
    await setSampleOrder(
      tx,
      userId,
      ordered.map((row) => row.id),
    );
  });
}

/** The getting-started steps, each worked out from what the account has actually done. */
export async function checklist(userId: string, db?: Queryable): Promise<Checklist> {
  const row = await readChecklistProgress(db ?? (await getDatabase()), userId);
  const reader = row.sample ? `/read/${row.sample}` : '/library';
  const steps: ChecklistStep[] = [
    {
      id: 'highlight',
      label: 'Highlight a line',
      hint: 'Open a sample and select any sentence',
      done: row.highlight,
      href: reader,
    },
    {
      id: 'ask',
      label: 'Ask about what you read',
      hint: 'Ask your library and follow a citation',
      done: row.ask,
      href: '/ask',
    },
    {
      id: 'save',
      label: 'Save your first link',
      hint: 'Paste any article or YouTube link',
      done: row.save,
      href: '/library?add=link',
    },
    {
      id: 'extension',
      label: 'Add the Chrome extension',
      hint: 'Save any page with Alt+Shift+S',
      done: row.extension,
      href: '/settings?section=extension',
    },
  ];
  const capabilities = configuredCapabilities();
  if (!capabilities.ai) {
    const ask = steps.findIndex((step) => step.id === 'ask');
    if (ask >= 0)
      steps.splice(ask, 1, {
        id: 'provider',
        label: 'Connect an AI provider',
        hint: 'Configure chat and summaries',
        done: false,
        href: '/settings?section=providers',
        optional: true,
      });
  }
  return { setupNeeded: row.seeded && !row.completed, show: row.seeded && !row.dismissed, steps };
}

export async function dismissChecklist(userId: string, db?: Queryable): Promise<void> {
  await markChecklistDismissed(db ?? (await getDatabase()), userId);
}
