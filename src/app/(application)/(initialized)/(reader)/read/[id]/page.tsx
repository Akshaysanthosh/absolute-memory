import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { FileReader } from '@/components/file-reader';
import { ReadingPage } from '@/features/reader/reader';
import { getAuth } from '@/server/auth/auth';
import { readerData } from '@/server/services/reading';
import { youtubeVideoId } from '@/server/services/thumbnails';
import { loginPathFor, RETURN_PATH_HEADER } from '@/shared/return-path';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const incoming = await headers();
  const session = await (await getAuth()).api.getSession({ headers: incoming });
  if (!session) redirect(loginPathFor(incoming.get(RETURN_PATH_HEADER)));
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const { item, highlights, mediaSource } = await readerData(session.user.id, id);
  if (!item) notFound();
  if (
    item.has_source &&
    (item.kind === 'pdf' || item.kind === 'image' || item.kind === 'spreadsheet') &&
    (view === 'original' || !item.reading_html)
  ) {
    return (
      <FileReader
        id={id}
        title={item.title}
        kind={item.kind}
        hasText={Boolean(item.reading_html)}
        imageInfo={item.image_info ?? undefined}
        imageText={item.passages.map((passage) => passage.text).join('\n\n')}
      />
    );
  }
  const media = mediaSource
    ? {
        videoId:
          mediaSource.kind === 'youtube' ? (youtubeVideoId(item.url) ?? undefined) : undefined,
        audioUrl:
          mediaSource.kind === 'podcast' && mediaSource.audio_url
            ? `/api/items/${id}/audio`
            : undefined,
        localFile:
          mediaSource.kind === 'audio' ||
          (mediaSource.kind === 'social' &&
            item.passages.some((passage) => passage.startMs !== undefined)),
        warning: mediaSource.warning,
      }
    : undefined;
  const { passages, ...document } = item;
  const cueTimes = media ? passages.map((passage) => passage.startMs ?? null) : undefined;
  return (
    <ReadingPage
      key={id}
      item={document}
      initialHighlights={highlights}
      media={media}
      cueTimes={cueTimes}
    />
  );
}
