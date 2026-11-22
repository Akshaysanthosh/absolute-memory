import { redirect } from 'next/navigation';

export default async function MediaRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  redirect(`/read/${encodeURIComponent(id)}${view === 'transcript' ? '?view=transcript' : ''}`);
}
