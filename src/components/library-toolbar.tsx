'use client';

import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { PanelLeft, SlidersHorizontal } from 'lucide-react';
import { LibraryHeader, LibrarySearch } from './library-header';
import { contentTypes } from './library-display';
import type { LibraryWorkspaceModel } from './use-library-workspace';

export function LibraryToolbar({
  model,
  openTopics,
}: {
  model: LibraryWorkspaceModel;
  openTopics: () => void;
}) {
  return (
    <LibraryHeader
      sidebarToggle={
        <Button
          className="library-topics-toggle"
          label="Open topics"
          isIconOnly
          icon={<PanelLeft size={18} />}
          variant="ghost"
          onClick={openTopics}
        />
      }
      search={
        <LibrarySearch ref={model.searchInput} value={model.search} onChange={model.setSearch} />
      }
      filters={
        <DropdownMenu
          button={{
            label: 'Filter library',
            isIconOnly: true,
            icon: <SlidersHorizontal size={18} />,
            variant: 'ghost',
          }}
          items={[
            {
              label: model.type === 'All types' ? '✓ All types' : 'All types',
              onClick: () => model.setType('All types'),
            },
            ...contentTypes.map(({ label, value }) => ({
              label: `${model.type === value ? '✓ ' : ''}${label}`,
              onClick: () => model.setType(value),
            })),
            { type: 'divider' },
            {
              label: model.topic ? 'All topics' : '✓ All topics',
              onClick: () => model.setTopic(''),
            },
            ...model.allTopics.map(([name]) => ({
              label: model.topic === name ? `✓ ${name}` : name,
              onClick: () => model.setTopic(name),
            })),
          ]}
        />
      }
      onCapture={() => model.openCapture('article')}
    />
  );
}
