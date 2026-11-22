import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/auth';
import { listHighlightPage } from '@/server/services/reading';
import { passageHref } from '@/shared/passages';

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
    <main>
      <h1>Highlights</h1>
      {!highlights.length && <p>Highlights you save will appear here.</p>}
      {[...grouped].map(([id, marks]) => (
        <section key={id}>
          <h2>
            <Link href={passageHref(id)}>{marks[0].title}</Link>
          </h2>
          <ul>
            {marks.map((mark) => (
              <li key={mark.id}>
                <Link href={passageHref(id, mark.segments[0]?.passageIndex)}>{mark.quote}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <nav aria-label="Highlight pages">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous page</Link>}
        {nextOffset !== null && <Link href={`?page=${page + 1}`}>Next page</Link>}
      </nav>
    </main>
  );
}
