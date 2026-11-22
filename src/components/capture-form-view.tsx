'use client';

import { plural } from '@/shared/plural';
import { DEFAULT_UPLOAD_MB, PDF_MAX_PAGES } from '@/shared/input-limits';
import Link from 'next/link';
import {
  Link as LinkIcon,
  FileText,
  X,
  ArrowRight,
  ArrowUpRight,
  LoaderCircle,
  Upload,
  Puzzle,
  Newspaper,
  Headphones,
  SquarePen,
  Image as ImageIcon,
} from 'lucide-react';
import styles from './capture-dialog.module.css';
import type { CaptureFormModel } from './use-capture-form';

export function CaptureFormView({ model }: { model: CaptureFormModel }) {
  const {
    browse,
    busy,
    capabilities,
    careful,
    dragging,
    episodeId,
    episodes,
    error,
    file,
    fileRef,
    fileTypes,
    kind,
    mediaUpload,
    onClose,
    onNote,
    podcast,
    ref,
    selectFile,
    setCareful,
    setDragging,
    setEpisodeId,
    setEpisodes,
    setError,
    setFile,
    setPodcast,
    setText,
    setTitle,
    setUrl,
    submit,
    text,
    title,
    titleRef,
    url,
    urlRef,
  } = model;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="capture-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
    >
      <div className={styles.heading}>
        <h2 id="capture-title">{kind === 'note' ? 'Add a note' : 'Add content'}</h2>
        <button disabled={busy} onClick={onClose} aria-label="Close save dialog">
          <span>ESC</span>
          <X size={16} />
        </button>
      </div>
      <form onSubmit={submit} aria-busy={busy}>
        {kind !== 'note' ? (
          <>
            <label className={styles.linkEntry}>
              <LinkIcon size={21} />
              <span className={styles.srOnly}>Content URL</span>
              <textarea
                ref={urlRef}
                name="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setEpisodes([]);
                  setEpisodeId('');
                }}
                disabled={busy}
                placeholder={
                  podcast
                    ? 'Paste a public podcast RSS feed URL…'
                    : 'Paste an article, image, website or video link…'
                }
                maxLength={4000}
                rows={3}
              />
            </label>
            <div className={styles.sources}>
              <p>TRY A SOURCE</p>
              <div>
                {/* Link and Podcast switch what the box above accepts, so they show which one is active. */}
                <button
                  type="button"
                  aria-pressed={!podcast}
                  disabled={busy}
                  onClick={() => {
                    setPodcast(false);
                    urlRef.current?.focus();
                  }}
                >
                  <Newspaper size={18} />
                  Link or video
                </button>
                <button
                  type="button"
                  aria-pressed={podcast}
                  disabled={busy}
                  onClick={() => {
                    setPodcast(true);
                    setFile(null);
                    setEpisodes([]);
                    setEpisodeId('');
                    urlRef.current?.focus();
                  }}
                >
                  <Headphones size={18} />
                  Podcast
                </button>
                <button type="button" disabled={busy} onClick={() => browse('application/pdf')}>
                  <FileText size={18} />
                  PDF
                </button>
                <button type="button" disabled={busy} onClick={() => browse('.xlsx')}>
                  <FileText size={18} />
                  Excel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => browse('image/png,image/jpeg,image/webp')}
                >
                  <ImageIcon size={18} />
                  Screenshot
                </button>
              </div>
            </div>
            {podcast && (
              <p className={styles.help}>
                Use a public RSS feed or an Apple Podcasts or Spotify episode link. Episodes must be
                available through a public feed; private and Spotify-exclusive audio are not
                supported.
              </p>
            )}
            {podcast && episodes.length > 0 && (
              <label>
                Episode
                <select
                  value={episodeId}
                  disabled={busy}
                  onChange={(e) => setEpisodeId(e.target.value)}
                  style={{ width: '100%', padding: 12 }}
                >
                  {episodes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                      {e.hasTranscript ? ' · Published transcript' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div
              className={styles.upload}
              data-dragging={dragging}
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (busy) return;
                if (event.dataTransfer.files.length !== 1) {
                  setError('Drop one file at a time.');
                  return;
                }
                selectFile(event.dataTransfer.files[0]);
              }}
            >
              <Upload size={24} />
              <strong>
                {file ? (
                  file.name
                ) : (
                  <>
                    Drop a file here, or{' '}
                    <button
                      className={styles.browse}
                      type="button"
                      disabled={busy}
                      onClick={() => browse(fileTypes)}
                    >
                      browse
                    </button>
                  </>
                )}
              </strong>
              <span>PDF · Excel · Images{mediaUpload && ' · Audio · Video'}</span>
              <input
                ref={fileRef}
                type="file"
                name="file"
                disabled={busy}
                accept={fileTypes}
                aria-label="Choose a supported file"
                onClick={(event) => {
                  event.currentTarget.value = '';
                }}
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
              {file && (
                <button
                  type="button"
                  className={styles.remove}
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                    setError('');
                  }}
                >
                  Remove file
                </button>
              )}
            </div>
            {/* Limits stay one tap away instead of filling the dialog. */}
            <details className={styles.limits}>
              <summary>File limits and privacy</summary>
              <p className={styles.help}>
                Files up to{' '}
                {capabilities ? capabilities.uploadBytes / 1024 / 1024 : DEFAULT_UPLOAD_MB} MB. PDFs
                up to {plural(PDF_MAX_PAGES, 'page')}.
              </p>
            </details>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={careful}
                disabled={busy || !!(file && !/\.pdf$/i.test(file.name))}
                onChange={(event) => setCareful(event.target.checked)}
              />
              Extra-careful text recognition (for scanned or complex PDFs)
            </label>
          </>
        ) : (
          <div className={styles.noteFields}>
            <label>
              Title
              <input
                ref={titleRef}
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                disabled={busy}
                maxLength={300}
                placeholder="Give this thought a name"
              />
            </label>
            <label>
              Your note
              <textarea
                name="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                required
                disabled={busy}
                maxLength={100000}
                rows={6}
                placeholder="What’s on your mind?"
              />
            </label>
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.formFooter}>
          <button type="button" className={styles.note} disabled={busy} onClick={() => onNote()}>
            {kind === 'note' ? (
              <>
                <LinkIcon size={19} />
                Link or file
              </>
            ) : (
              <>
                <SquarePen size={19} />
                Note
              </>
            )}
          </button>
          <button className={styles.save} disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle className="spin" size={16} />
                Saving…
              </>
            ) : (
              <>
                {podcast && !episodes.length ? 'Find episodes' : 'Save'}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </form>
      <div className={styles.extension}>
        <Puzzle size={22} />
        <span>
          Add content in one click<small>with the Absolute Memory Chrome extension</small>
        </span>
        {busy ? (
          <span>Chrome extension</span>
        ) : (
          <Link href="/settings?section=extension" onClick={onClose}>
            Get extension
            <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </dialog>
  );
}
