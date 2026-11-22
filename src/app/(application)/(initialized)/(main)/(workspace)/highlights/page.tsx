import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/auth';
import { listHighlightPage } from '@/server/services/reading';
import { passageHref } from '@/shared/passages';
import styles from './highlights.module.css';

export const metadata = { title: 'Highlights · Absolute Memory' };
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export default async function HighlightsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const requested = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 10000) : 1;
  const limit = 100;
  const { highlights, nextOffset } = await listHighlightPage(session.user.id, {
    limit,
    offset: (page - 1) * limit,
  });
  const grouped = new Map<string, typeof highlights>();
  for (const highlight of highlights) {
    const existing = grouped.get(highlight.itemId) ?? [];
    existing.push(highlight);
    grouped.set(highlight.itemId, existing);
  }
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1>Highlights</h1>
        <p>
          Every passage you have highlighted, newest first. Select one to open it in the reader.
        </p>
      </header>
      {!highlights.length && (
        <section className={styles.empty}>
          <h2>No highlights yet</h2>
          <p>Open anything you have saved, select text and press H. It will appear here.</p>
        </section>
      )}
      {[...grouped].map(([id, marks]) => (
        <section key={id} className={styles.group}>
          <h2>
            <Link href={passageHref(id)}>{marks[0].title}</Link>
            <span>{marks.length === 1 ? '1 highlight' : `${marks.length} highlights`}</span>
          </h2>
          <ul className={styles.quotes}>
            {marks.map((mark) => (
              <li key={mark.id}>
                <Link href={passageHref(id, mark.segments[0]?.passageIndex)}>{mark.quote}</Link>
                <time dateTime={new Date(mark.createdAt).toISOString()}>
                  {dateFormat.format(new Date(mark.createdAt))}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <nav aria-label="Highlight pages" className={styles.pager}>
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous page</Link>}
        {nextOffset !== null && <Link href={`?page=${page + 1}`}>Next page</Link>}
      </nav>
    </main>
  );
}
