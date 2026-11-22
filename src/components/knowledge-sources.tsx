'use client';
import { plural } from '@/shared/plural';
import Link from 'next/link';
import Markdown from 'react-markdown';
import {
  passageUrl,
  sameWebSource,
  validateCitations,
  type KnowledgeSource,
} from '@/shared/knowledge/shared';
export function SourceLink({
  source,
  children,
}: {
  source: KnowledgeSource;
  children: React.ReactNode;
}) {
  if (source.type === 'web')
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  if (source.available === false)
    return <span title="The saved source was deleted or changed">{children} (unavailable)</span>;
  return <Link href={passageUrl(source.itemId, source.passageIndex)}>{children}</Link>;
}
export function CitedAnswer({ answer, sources }: { answer: string; sources: KnowledgeSource[] }) {
  const marked = validateCitations(answer, sources).replace(/\[(\d+)\]/g, (all, key) =>
    sources.some((s) => s.key === key) ? `[${key}](#citation-${key})` : '[source unavailable]',
  );
  return (
    <div className="kg-answer">
      <Markdown
        skipHtml
        components={{
          a: ({ href, children }) => {
            const source = sources.find(
              (s) =>
                href === `#citation-${s.key}` ||
                (s.type === 'web' && !!href && sameWebSource(href, s.url)),
            );
            return source ? (
              <SourceLink source={source}>{children}</SourceLink>
            ) : (
              <span>{children}</span>
            );
          },
        }}
      >
        {marked}
      </Markdown>
    </div>
  );
}
export function SourceList({ sources }: { sources: KnowledgeSource[] }) {
  if (!sources.length) return null;
  const saved = sources.filter(({ type }) => type === 'saved').length;
  const web = sources.length - saved;
  const counts = [saved && plural(saved, 'saved passage'), web && plural(web, 'web source')];
  return (
    <details className="kg-sources">
      <summary>{counts.filter(Boolean).join(' · ')}</summary>
      {sources.map((s) => (
        <div key={s.key}>
          <span className="kg-source-note">
            {s.type === 'saved' ? 'Saved reading' : 'Web source'}
          </span>
          <SourceLink source={s}>
            {s.key} · {s.title}
          </SourceLink>
        </div>
      ))}
    </details>
  );
}
