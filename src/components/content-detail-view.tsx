'use client';

import { sourceLine, usable } from './content-detail-text';

import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  Download,
  Plus,
  Star,
  Archive,
  Link as LinkIcon,
  X,
} from 'lucide-react';
import { api } from '@/shared/client';
import { ItemTitle } from './item-title';
import styles from './content-detail-dialog-styles';
import type { ContentDetailModel } from './use-content-detail';
export function ContentDetailView({ model }: { model: ContentDetailModel }) {
  const {
    aiEnabled,
    base,
    broken,
    busy,
    dialog,
    drawer,
    error,
    expanded,
    favorite,
    image,
    item,
    loaded,
    nothingSaved,
    notice,
    onClose,
    photo,
    platform,
    post,
    readHref,
    readLabel,
    save,
    setAttempt,
    setBroken,
    setError,
    setExpanded,
    setFavorite,
    setLoaded,
    setNotice,
    setPhoto,
    setTag,
    setTagOpen,
    setTags,
    source,
    summary,
    tag,
    tagOpen,
    tags,
    type,
    video,
    visualFirst,
  } = model;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      data-drawer={drawer || undefined}
      tabIndex={-1}
      aria-labelledby="content-detail-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (drawer && e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.card}>
        <section className={styles.stage} aria-label="Content preview">
          <div className={styles.stageTop}>
            <span className={styles.type}>{type}</span>
          </div>
          <div className={styles.visual}>
            {visualFirst && image && !broken ? (
              <img
                src={image}
                alt={item.source_details?.image?.description || item.title}
                onError={() => setBroken(true)}
              />
            ) : !summary && platform && !(image && !broken) ? (
              <div className={styles.platformVisual} data-platform={platform.toLowerCase()}>
                <span className={styles.platformName}>{platform}</span>
                <h2>{item.title}</h2>
                {source && (
                  <a
                    className={styles.primary}
                    href={source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on {platform}
                    <ArrowUpRight size={16} />
                  </a>
                )}
              </div>
            ) : (
              <div className={styles.textVisual}>
                {image && !broken ? (
                  <img src={image} alt="" onError={() => setBroken(true)} />
                ) : (
                  <BookOpen size={32} />
                )}
                <h2>{item.title}</h2>
                <p>{summary || usable(item.excerpt)}</p>
              </div>
            )}
          </div>
          {post && post.images.length > 1 && (
            <div className={styles.socialPhotos} aria-label="Post images">
              {post.images.map((entry, index) => (
                <button
                  key={entry.url}
                  aria-label={`Show image ${index + 1}`}
                  aria-pressed={photo === index}
                  onClick={() => {
                    setPhoto(index);
                    setBroken(false);
                  }}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          )}
          {video && (
            <div className={styles.stageBottom}>
              <span className={styles.caption}>Thumbnail preview · watch on the original site</span>
            </div>
          )}
        </section>
        <aside className={styles.details}>
          <header className={styles.detailHeader}>
            <div className={styles.topActions}>
              <span className={styles.eyebrow}>
                {type} ·{' '}
                {new Date(item.created_at).toLocaleDateString('en', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <button onClick={onClose} aria-label="Close details">
                <X size={20} />
              </button>
            </div>
            <div id="content-detail-title" className={styles.detailTitle}>
              <ItemTitle id={item.id} title={item.title} />
            </div>
            <span className={styles.domain}>
              {item.domain || item.source_file?.name || 'Your library'}
            </span>
            {sourceLine(item.source_details?.source) && (
              <span className={styles.domain}>{sourceLine(item.source_details?.source)}</span>
            )}
            {nothingSaved && (
              <span className={styles.domain} role="status">
                No transcript or post text is available. Open the original to watch it.
              </span>
            )}
            <div className={styles.readAction}>
              {item.kind === 'image' ? (
                <a className={styles.primary} href={`${base}/source`} download>
                  <Download size={17} />
                  Download original
                </a>
              ) : (
                readHref && (
                  <Link className={styles.primary} href={readHref}>
                    <BookOpen size={17} />
                    {readLabel}
                  </Link>
                )
              )}
              {source && (
                <a
                  className={styles.sourceLink}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {video ? 'Watch original' : 'Open original'}
                  <ArrowUpRight size={15} />
                </a>
              )}
            </div>
          </header>
          <div className={styles.detailBody}>
            {post?.text && (
              <section className={styles.summary}>
                <h3>ORIGINAL POST{post.author ? ` · ${post.author}` : ''}</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{post.text}</p>
              </section>
            )}
            {!post?.text && item.source_details?.source?.text && (
              <section className={styles.summary}>
                <h3>
                  ORIGINAL POST
                  {item.source_details.source.authorHandle || item.source_details.source.authorName
                    ? ` · ${item.source_details.source.authorName || item.source_details.source.authorHandle}`
                    : ''}
                </h3>
                <p
                  style={{ whiteSpace: 'pre-wrap' }}
                  className={expanded ? undefined : styles.clamped}
                >
                  {item.source_details.source.text}
                </p>
              </section>
            )}
            <section className={styles.summary}>
              <h3>{item.kind === 'image' ? 'IN THIS IMAGE' : 'SUMMARY'}</h3>
              <p className={expanded ? undefined : styles.clamped}>
                {summary ||
                  (!loaded
                    ? 'Loading summary…'
                    : item.bookmark_type || platform
                      ? `Saved as a link. Open it on ${platform || 'the original site'} to see the full ${platform ? 'post' : 'page'}.`
                      : aiEnabled
                        ? 'No summary yet. It usually appears shortly after saving.'
                        : 'Connect an AI provider to generate summaries.')}
              </p>
              {summary.length > 260 && (
                <button onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </section>
            <section>
              <div className={styles.sectionHeading}>
                <h3>TAGS</h3>
                <button className={styles.addTag} onClick={() => setTagOpen((v) => !v)}>
                  <Plus size={15} />
                  Add tag
                </button>
              </div>
              <div className={styles.tags}>
                {tags.map((name) => (
                  <span key={name}>
                    {name}
                    <button
                      disabled={busy}
                      aria-label={`Remove tag ${name}`}
                      onClick={() =>
                        void save(async () => {
                          const next = tags.filter((t) => t !== name);
                          await api(`${base}/knowledge`, {
                            method: 'PATCH',
                            body: JSON.stringify({ tags: next }),
                          });
                          setTags(next);
                        })
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              {tagOpen && (
                <form
                  className={styles.tagForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(async () => {
                      await api(`${base}/knowledge`, {
                        method: 'PATCH',
                        body: JSON.stringify({ addTag: tag.trim() }),
                      });
                      const data = await api<{ tags: string[] }>(`${base}/knowledge`);
                      setTags(data.tags);
                      setTag('');
                      setTagOpen(false);
                    });
                  }}
                >
                  <input
                    autoFocus
                    aria-label="New tag"
                    maxLength={60}
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                  />
                  <button disabled={busy || !tag.trim()}>Save tag</button>
                </form>
              )}
            </section>
            {error && (
              <p role="alert">
                {error}
                <button
                  type="button"
                  className={styles.retry}
                  onClick={() => {
                    setError('');
                    setLoaded(false);
                    setAttempt((a) => a + 1);
                  }}
                >
                  Retry
                </button>
              </p>
            )}
          </div>
          <footer className={styles.footer}>
            <div className={styles.utility}>
              <button
                disabled={busy}
                aria-label="Favorite"
                title="Favorite"
                aria-pressed={favorite}
                onClick={() =>
                  void save(async () => {
                    await api(base, {
                      method: 'PATCH',
                      body: JSON.stringify({ favorite: !favorite }),
                    });
                    setFavorite((v) => !v);
                  })
                }
              >
                <Star size={19} fill={favorite ? 'currentColor' : 'none'} />
              </button>
              <button
                aria-label="Copy link"
                title="Copy link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${location.origin}/library?item=${item.id}`,
                    );
                    setNotice('Link copied');
                  } catch {
                    setError('Could not copy the link.');
                  }
                }}
              >
                <LinkIcon size={19} />
              </button>
              <button
                disabled={busy}
                aria-label={item.archived ? 'Restore item' : 'Archive item'}
                title={item.archived ? 'Restore item' : 'Archive item'}
                onClick={() =>
                  void save(async () => {
                    await api(base, {
                      method: 'PATCH',
                      body: JSON.stringify({ archived: !item.archived }),
                    });
                    onClose();
                  })
                }
              >
                <Archive size={19} />
              </button>
            </div>
            <span className={styles.notice} role="status">
              {busy ? 'Saving…' : notice}
            </span>
          </footer>
        </aside>
      </div>
    </dialog>
  );
}
