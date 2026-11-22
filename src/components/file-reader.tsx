'use client';
import { ItemTitle } from './item-title';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { SavedImageViewer } from './saved-image-viewer';
import type { SourceDetails } from '@/shared/types';

const PdfViewer = dynamic(() => import('./pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <p role="status">Opening PDF…</p>,
});
const WorkbookViewer = dynamic(() => import('./workbook-viewer').then((m) => m.WorkbookViewer), {
  ssr: false,
  loading: () => <p role="status">Opening workbook…</p>,
});

export function FileReader({
  id,
  title,
  kind,
  hasText,
  imageInfo,
  imageText,
}: {
  id: string;
  title: string;
  kind: 'pdf' | 'spreadsheet' | 'image';
  hasText: boolean;
  imageInfo?: SourceDetails['image'];
  imageText?: string;
}) {
  const [retry, setRetry] = useState(0);
  const original = `/api/items/${id}/source`;
  return (
    <div className="reading-file">
      <Link href="/library">Back to library</Link>
      <div className="file-reader-bar">
        <ItemTitle id={id} title={title} />
        <nav aria-label="File actions">
          {hasText && <Link href={`/read/${id}`}>Extracted text</Link>}
          <a href={original} download>
            {kind === 'image' ? 'Download original' : 'Download'}
          </a>
        </nav>
      </div>
      <main className="file-reader-content">
        <h1 className="sr-only">{title}</h1>
        {kind === 'pdf' ? (
          <PdfViewer key={retry} file={original} onRetry={() => setRetry((value) => value + 1)} />
        ) : kind === 'image' ? (
          <SavedImageViewer id={id} title={title} info={imageInfo} text={imageText || ''} />
        ) : (
          <WorkbookViewer
            key={retry}
            file={original}
            onRetry={() => setRetry((value) => value + 1)}
          />
        )}
      </main>
    </div>
  );
}
