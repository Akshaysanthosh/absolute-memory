'use client';
import type { ReactNode, Ref } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Plus, Search, X } from 'lucide-react';
import { WorkspaceAccount } from './workspace-rail';
import { ThemeSwitch } from './theme-switch';

export function LibraryHeader({
  search,
  sidebarToggle,
  filters,
  onCapture,
}: {
  search: ReactNode;
  sidebarToggle?: ReactNode;
  filters?: ReactNode;
  onCapture: () => void;
}) {
  return (
    <header className="workspace-topbar" aria-label="Workspace controls">
      {sidebarToggle}
      {search}
      <span className="workspace-topbar-spacer" />
      {filters}
      <ThemeSwitch />
      <WorkspaceAccount mobile />
      <Button
        className="workspace-top-add"
        variant="primary"
        label="Add"
        aria-label="Add to library"
        icon={<Plus size={16} />}
        endContent={<kbd aria-hidden="true">⌘K</kbd>}
        aria-keyshortcuts="Meta+K Control+K"
        onClick={onCapture}
      />
    </header>
  );
}

export function LibrarySearch({
  ref,
  value,
  onChange,
  onSubmit,
}: {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  const field = (
    <>
      <Search size={16} aria-hidden="true" />
      <input
        ref={ref}
        aria-label="Search your saved library"
        placeholder="Search your library"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-keyshortcuts="Meta+/ Control+/"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={15} />
        </button>
      )}
      {!value && (
        <kbd className="al-search-shortcut" aria-hidden="true">
          ⌘/
        </kbd>
      )}
    </>
  );
  return onSubmit ? (
    <form
      className="al-search-field"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {field}
    </form>
  ) : (
    <div className="al-search-field">{field}</div>
  );
}
