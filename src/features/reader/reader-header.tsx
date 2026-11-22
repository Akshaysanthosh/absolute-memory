import { Button } from '@astryxdesign/core/Button';
import { Popover } from '@astryxdesign/core/Popover';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Ref } from 'react';
import { measures, sizes, themes, type ReaderPreferences } from './preferences';

export type ReaderDocument = {
  id: string;
  title: string;
  url: string | null;
  author: string | null;
  source_name: string | null;
  published_at: string | null;
  domain: string | null;
  reading_html: string;
  lead_image: string | null;
  reader_position: number | null;
  has_source: boolean;
  progress: number;
  words: number;
  status: string;
};

export function sourceLink(item: ReaderDocument) {
  return item.url && /^https?:\/\//i.test(item.url) ? item.url : undefined;
}

const date = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function Appearance({
  settings,
  onChange,
}: {
  settings: ReaderPreferences;
  onChange: (settings: Partial<ReaderPreferences>) => void;
}) {
  function group<Key extends keyof ReaderPreferences>(
    key: Key,
    label: string,
    values: readonly ReaderPreferences[Key][],
  ) {
    return (
      <div className="reading-option">
        <span aria-hidden="true">{label}</span>
        <SegmentedControl
          label={label}
          value={settings[key]}
          onChange={(value) => onChange({ [key]: value })}
          layout="fill"
          size="sm"
        >
          {values.map((value) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={value[0].toUpperCase() + value.slice(1)}
            />
          ))}
        </SegmentedControl>
      </div>
    );
  }
  return (
    <div className="reading-options">
      {group('theme', 'Theme', themes)}
      {group('size', 'Text size', sizes)}
      {group('measure', 'Line width', measures)}
    </div>
  );
}

export function ReaderHeader({
  item,
  titleRef,
  barRef,
  progress,
  pastTitle,
  settings,
  onChange,
  onAppearanceOpen,
  onHelp,
}: {
  item: ReaderDocument;
  titleRef: Ref<HTMLHeadingElement>;
  barRef: Ref<HTMLElement>;
  progress: number;
  pastTitle: boolean;
  settings: ReaderPreferences;
  onChange: (settings: Partial<ReaderPreferences>) => void;
  onAppearanceOpen: (open: boolean) => void;
  onHelp: () => void;
}) {
  const link = sourceLink(item);
  const site = item.source_name || item.domain;
  const published = item.published_at && new Date(item.published_at);
  const lead = item.lead_image;
  const imagePrefix = `/api/items/${item.id}/reading-images/`;
  const sameOriginImage =
    lead?.startsWith(imagePrefix) && /^\d+$/.test(lead.slice(imagePrefix.length));
  const showLead = lead && sameOriginImage && !item.reading_html.includes(`src="${lead}"`);
  return (
    <>
      <header className="reading-bar" ref={barRef}>
        <div className="reading-bar-inner">
          <Button
            as={Link}
            href="/library"
            className="reading-back"
            label="Back to library"
            icon={<ArrowLeft size={17} aria-hidden="true" />}
            variant="ghost"
            size="sm"
          >
            Library
          </Button>
          <span className="reading-bar-title" aria-hidden="true">
            {pastTitle ? item.title : ''}
          </span>
          <Popover
            content={<Appearance settings={settings} onChange={onChange} />}
            label="Appearance"
            alignment="end"
            width={290}
            onOpenChange={onAppearanceOpen}
          >
            <Button
              label="Appearance"
              className="reading-type-button"
              variant="secondary"
              size="sm"
            >
              Aa
            </Button>
          </Popover>
          <Tooltip content="Keyboard shortcuts" placement="below" alignment="end">
            <Button
              label="Keyboard help"
              icon={<span aria-hidden="true">?</span>}
              isIconOnly
              variant="ghost"
              size="sm"
              onClick={onHelp}
            />
          </Tooltip>
        </div>
        <progress
          className="reading-progress"
          value={progress}
          max={1}
          aria-label="Reading progress"
        />
      </header>
      <div className="reading-column reading-heading">
        <h1 ref={titleRef}>{item.title}</h1>
        <ul className="reading-meta">
          {item.author && <li>By {item.author}</li>}
          {link ? (
            <li>
              <a href={link} rel="noreferrer noopener">
                {site || 'Original source'}
              </a>
            </li>
          ) : (
            site && <li>{site}</li>
          )}
          {published && !Number.isNaN(published.getTime()) && (
            <li>
              <time dateTime={published.toISOString()}>{date.format(published)}</time>
            </li>
          )}
          {item.words > 0 && <li>{Math.ceil(item.words / 220)} min read</li>}
          {item.has_source && (
            <li>
              <Link href={`/read/${item.id}?view=original`}>Original file</Link>
            </li>
          )}
        </ul>
        {showLead && item.reading_html && <img className="reading-lead" src={lead} alt="" />}
      </div>
    </>
  );
}
