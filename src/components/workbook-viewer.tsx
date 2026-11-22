'use client';

import { plural } from '@/shared/plural';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { read, utils, type WorkBook, type WorkSheet } from 'xlsx';
import { workbookLimits } from '@/shared/workbook-policy';

const rowHeight = 32,
  columnWidth = 152,
  headerWidth = 56;
export function WorkbookViewer({ file, onRetry }: { file: string; onRetry: () => void }) {
  const [book, setBook] = useState<WorkBook>();
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const request = new AbortController();
    void fetch(file, { signal: request.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load this workbook.');
        const data = await response.arrayBuffer();
        if (request.signal.aborted) return;
        const workbook = read(data, {
          type: 'array',
          cellText: true,
          cellHTML: false,
          cellFormula: true,
          bookVBA: false,
          sheetRows: workbookLimits.rows + 1,
        });
        if (workbook.SheetNames.length > workbookLimits.sheets)
          throw new Error(`The viewer supports up to ${plural(workbookLimits.sheets, 'sheet')}.`);
        const first = workbook.SheetNames.find(
          (_, index) => !workbook.Workbook?.Sheets?.[index]?.Hidden,
        );
        if (!first) throw new Error('This workbook has no visible sheets.');
        setBook(workbook);
        setActive(first);
      })
      .catch((error) => {
        if (!request.signal.aborted)
          setError(error instanceof Error ? error.message : 'Could not open this workbook.');
      });
    return () => request.abort();
  }, [file]);

  if (error)
    return (
      <p role="alert">
        {error} <button onClick={onRetry}>Try again</button>
      </p>
    );
  if (!book) return <p role="status">Reading workbook…</p>;
  return (
    <>
      <nav className="file-reader-controls workbook-tabs" aria-label="Workbook sheets">
        {book.SheetNames.filter((_, index) => !book.Workbook?.Sheets?.[index]?.Hidden).map(
          (name) => (
            <button key={name} aria-pressed={name === active} onClick={() => setActive(name)}>
              {name}
            </button>
          ),
        )}
      </nav>
      {book.Sheets[active] && <SheetGrid key={active} name={active} sheet={book.Sheets[active]} />}
    </>
  );
}

function SheetGrid({ sheet, name }: { sheet: WorkSheet; name: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const actual = utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  const rows = Math.min(actual.e.r + 1, workbookLimits.rows),
    columns = Math.min(actual.e.c + 1, workbookLimits.columns);
  const rowVirtual = useVirtualizer({
    count: rows,
    getScrollElement: () => viewport.current,
    estimateSize: () => rowHeight,
    overscan: 6,
    scrollMargin: rowHeight,
  });
  const colVirtual = useVirtualizer({
    count: columns,
    getScrollElement: () => viewport.current,
    estimateSize: () => columnWidth,
    horizontal: true,
    overscan: 3,
    scrollMargin: headerWidth,
  });
  const merges = useMemo(() => (sheet['!merges'] || []).slice(0, workbookLimits.merges), [sheet]);
  const visibleRows = rowVirtual.getVirtualItems(),
    visibleCols = colVirtual.getVirtualItems();
  const activeMerges = merges.filter(
    (range) =>
      visibleRows.some((row) => row.index >= range.s.r && row.index <= range.e.r) &&
      visibleCols.some((col) => col.index >= range.s.c && col.index <= range.e.c),
  );
  const clipped =
    rows < actual.e.r + 1 ||
    columns < actual.e.c + 1 ||
    (sheet['!merges']?.length || 0) > merges.length;
  const cell = (row: number, col: number) => {
    const value = sheet[utils.encode_cell({ r: row, c: col })];
    return {
      text: value?.w ?? (value?.v != null ? String(value.v) : value?.f ? `=${value.f}` : ''),
      formula: value?.f ? `=${value.f}` : undefined,
    };
  };
  return (
    <>
      {clipped && (
        <p role="status">
          Showing up to {rows.toLocaleString()} rows, {columns} columns, and{' '}
          {workbookLimits.merges.toLocaleString()} merged ranges. Download for the full workbook.
        </p>
      )}
      <div
        className="workbook-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label={`${name} spreadsheet`}
      >
        <div
          role="table"
          aria-rowcount={rows + 1}
          aria-colcount={columns + 1}
          aria-label={name}
          className="workbook-grid"
          style={{
            width: headerWidth + columns * columnWidth,
            height: rowHeight + rows * rowHeight,
          }}
        >
          <div
            role="row"
            className="workbook-column-headers"
            style={{ height: rowHeight }}
            aria-rowindex={1}
          >
            <span
              className="workbook-corner"
              role="columnheader"
              aria-label="Row number"
              style={{ width: headerWidth }}
            />
            {visibleCols.map((col) => (
              <span
                key={col.key}
                className="workbook-cell"
                role="columnheader"
                aria-colindex={col.index + 2}
                style={{ left: col.start, width: columnWidth }}
              >
                {utils.encode_col(col.index)}
              </span>
            ))}
          </div>
          {visibleRows.map((row) => (
            <div
              key={row.key}
              role="row"
              aria-rowindex={row.index + 2}
              className="workbook-row"
              style={{ top: row.start, height: rowHeight }}
            >
              <span
                className="workbook-row-header"
                role="rowheader"
                aria-colindex={1}
                style={{ width: headerWidth }}
              >
                {row.index + 1}
              </span>
              {visibleCols.map((col) => {
                const merged = activeMerges.some(
                  (range) =>
                    row.index >= range.s.r &&
                    row.index <= range.e.r &&
                    col.index >= range.s.c &&
                    col.index <= range.e.c,
                );
                if (merged) return null;
                const { text, formula } = cell(row.index, col.index);
                return (
                  <span
                    key={col.key}
                    role="cell"
                    aria-colindex={col.index + 2}
                    className="workbook-cell"
                    style={{ left: col.start, width: columnWidth }}
                    title={formula || text}
                  >
                    {text}
                  </span>
                );
              })}
            </div>
          ))}
          <div role="presentation">
            {activeMerges.map((range) => {
              const { text, formula } = cell(range.s.r, range.s.c);
              return (
                <span
                  key={utils.encode_cell(range.s)}
                  className="workbook-cell workbook-merged"
                  title={formula || text}
                  style={{
                    left: headerWidth + range.s.c * columnWidth,
                    top: rowHeight + range.s.r * rowHeight,
                    width: (Math.min(columns - 1, range.e.c) - range.s.c + 1) * columnWidth,
                    height: (Math.min(rows - 1, range.e.r) - range.s.r + 1) * rowHeight,
                  }}
                >
                  {text}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="workbook-note">
        Formula cells show their saved result when available. Hover to see the formula.
      </p>
    </>
  );
}
