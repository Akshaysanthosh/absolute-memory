import { after } from 'next/server';
import { getConfig } from '@/server/config';

export function afterInlineWork(task: () => unknown | Promise<unknown>) {
  if (getConfig().ROLE === 'all')
    after(async () => {
      await task();
    });
}
