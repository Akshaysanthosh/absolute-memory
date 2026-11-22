'use client';

import type { Item } from '@/shared/types';
import { useContentDetail } from './use-content-detail';
import { ContentDetailView } from './content-detail-view';

export function ContentDetailDialog({
  item,
  onClose,
  aiEnabled,
}: {
  aiEnabled: boolean;
  item: Item | null;
  onClose: () => void;
}) {
  return item ? <Detail key={item.id} item={item} onClose={onClose} aiEnabled={aiEnabled} /> : null;
}
function Detail(props: Parameters<typeof useContentDetail>[0]) {
  return <ContentDetailView model={useContentDetail(props)} />;
}
