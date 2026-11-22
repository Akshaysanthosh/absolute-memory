'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
const pdfOptions = { maxImageSize: 16_777_216, isEvalSupported: false };

export function PdfViewer({ file, onRetry }: { file: string; onRetry: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, Math.min(880, Math.floor(entry.contentRect.width) - 20))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <nav className="file-reader-controls" aria-label="PDF page controls">
        <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
          Previous
        </button>
        <label>
          Page{' '}
          <input
            type="number"
            min={1}
            max={pages || 1}
            value={page}
            disabled={!pages}
            onChange={(event) =>
              setPage(Math.min(pages, Math.max(1, Number(event.target.value) || 1)))
            }
          />
        </label>
        <span aria-live="polite">of {pages || '…'}</span>
        <button disabled={!pages || page >= pages} onClick={() => setPage((value) => value + 1)}>
          Next
        </button>
        <label>
          Zoom{' '}
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {[75, 100, 125, 150, 200].map((value) => (
              <option key={value} value={value}>
                {value === 100 ? 'Fit width' : `${value}%`}
              </option>
            ))}
          </select>
        </label>
      </nav>
      <div className="pdf-viewport" ref={viewport}>
        <Document
          file={file}
          options={pdfOptions}
          externalLinkTarget="_blank"
          externalLinkRel="noopener noreferrer"
          onLoadSuccess={({ numPages }) => setPages(numPages)}
          error={
            <p role="alert">
              Could not open this PDF. <button onClick={onRetry}>Try again</button>
            </p>
          }
          loading={<p role="status">Loading original pages…</p>}
        >
          {pages > 0 && (
            <Page pageNumber={page} width={Math.round((width * zoom) / 100)} renderForms={false} />
          )}
        </Document>
      </div>
    </>
  );
}
