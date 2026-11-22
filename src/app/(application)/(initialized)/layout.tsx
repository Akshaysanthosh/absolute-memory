import { redirect } from 'next/navigation';
import { instanceOwner } from '@/server/services/instance';

export const dynamic = 'force-dynamic';

export default async function InitializedLayout({ children }: { children: React.ReactNode }) {
  if (!(await instanceOwner())) redirect('/setup');
  return children;
}
