import type { Item } from '@/shared/types';

export type LibraryPage = {
  items: Item[];
  nextCursor: string | null;
  topics?: string[];
  total?: number;
};
