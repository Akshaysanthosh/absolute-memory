import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Absolute Memory · Reader' };

export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
