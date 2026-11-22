import { KnowledgeGraph } from '@/components/knowledge-graph';
export const metadata = { title: 'Graph · Absolute Memory' };
export default async function Page({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  const initialItemId = item && /^[a-f0-9-]{36}$/i.test(item) ? item : undefined;
  return <KnowledgeGraph initialItemId={initialItemId} />;
}
