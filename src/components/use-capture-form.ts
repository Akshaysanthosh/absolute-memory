'use client';

import type { Capabilities } from '@/shared/capabilities';
import { isMediaFilename, mediaFileAccept } from '@/shared/media/upload';
import { DEFAULT_UPLOAD_MB } from '@/shared/input-limits';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/shared/client';
import { captureInputMode } from '@/shared/capture-input';
type Kind = 'article' | 'note' | 'file';
type Episode = { id: string; title: string; duration: number | null; hasTranscript: boolean };
const documentFileTypes = '.xlsx,application/pdf,image/png,image/jpeg,image/webp';
export type CaptureDialogProps = {
  initialKind?: Kind;
  open: boolean;
  onClose: () => void;
  onSaved: (id: string, duplicate: boolean) => void;
  onSaving?: (source: string) => void;
  onSaveFailed?: () => void;
};

export function useCaptureForm({
  open,
  onClose,
  onSaved,
  onSaving,
  onSaveFailed,
  initialKind = 'article',
  onNote,
}: CaptureDialogProps & { onNote: () => void }) {
  const ref = useRef<HTMLDialogElement>(null),
    urlRef = useRef<HTMLTextAreaElement>(null),
    titleRef = useRef<HTMLInputElement>(null),
    fileRef = useRef<HTMLInputElement>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const mediaUpload = capabilities?.mediaUpload ?? false;
  const fileTypes = documentFileTypes + (mediaUpload ? ',' + mediaFileAccept : '');
  const [kind, setKind] = useState<Kind>('article');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [podcast, setPodcast] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodeId, setEpisodeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [careful, setCareful] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (open) {
      setPodcast(false);
      setEpisodes([]);
      setEpisodeId('');
      setKind(initialKind);
      setError('');
      ref.current?.showModal();
    } else ref.current?.close();
  }, [open, initialKind]);
  useEffect(() => {
    if (open)
      (kind === 'note'
        ? titleRef.current
        : kind === 'file'
          ? fileRef.current
          : urlRef.current
      )?.focus();
  }, [open, kind]);
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    void api<Capabilities>('/api/capabilities')
      .then((value) => {
        if (mounted) setCapabilities(value);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [open]);
  function choose(next: Kind) {
    if (!busy) {
      setPodcast(false);
      setKind(next);
      setError('');
    }
  }
  function selectFile(next: File | undefined) {
    if (!next || busy) return;
    const media = isMediaFilename(next.name);
    if (media && !mediaUpload) {
      setError('Audio and video uploads need a configured transcription provider.');
      return;
    }
    if (!next.size || next.size > (capabilities?.uploadBytes ?? DEFAULT_UPLOAD_MB * 1024 * 1024)) {
      setError('Choose a non-empty file within the upload limit shown below.');
      return;
    }
    if (!media && !/\.(pdf|xlsx|png|jpe?g|webp)$/i.test(next.name)) {
      setError('Choose a supported file.');
      return;
    }
    setPodcast(false);
    setFile(next);
    setError('');
  }
  function browse(accept: string) {
    if (!fileRef.current || busy) return;
    fileRef.current.accept = accept;
    fileRef.current.click();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const mode = captureInputMode({ kind, url, hasFile: Boolean(file), podcast });
      if (mode === 'podcast') {
        setPodcast(true);
        if (episodeId)
          onSaving?.(episodes.find((episode) => episode.id === episodeId)?.title || url.trim());
        const result = await api<{ episodes?: Episode[]; id: string; duplicate: boolean }>(
          '/api/podcasts',
          {
            method: 'POST',
            body: JSON.stringify({ feedUrl: url.trim(), ...(episodeId ? { episodeId } : {}) }),
          },
        );
        if (result.episodes) {
          setEpisodes(result.episodes);
          setEpisodeId(result.episodes[0]?.id || '');
          return;
        }
        setUrl('');
        setEpisodes([]);
        setEpisodeId('');
        onSaved(result.id, result.duplicate);
        onClose();
        return;
      }
      if (kind !== 'note' && file) {
        onSaving?.(file.name);
        const response = await fetch('/api/documents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
            'X-Careful-Read': String(careful),
          },
          body: file,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || 'Could not save this file. Please try again.');
        setFile(null);
        setCareful(false);
        if (fileRef.current) fileRef.current.value = '';
        onSaved(result.id, result.duplicate === true);
        onClose();
      } else {
        if (kind !== 'note') {
          if (!url.trim()) throw new Error('Paste an article link or choose a file.');
          if (/\s/.test(url.trim())) throw new Error('Please save one article link at a time.');
          let parsed: URL;
          try {
            parsed = new URL(url.trim());
          } catch {
            throw new Error('Enter a complete article URL starting with https:// or http://.');
          }
          if (!['https:', 'http:'].includes(parsed.protocol))
            throw new Error('Use an https:// or http:// article link.');
        }
        const payload =
          kind === 'note' ? { kind, title, text } : { kind: 'article', url: url.trim() };
        if (kind !== 'note') onSaving?.(url.trim());
        const result = await api<{ id: string; duplicate: boolean }>('/api/capture', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (kind === 'note') {
          setTitle('');
          setText('');
        } else setUrl('');
        onSaved(result.id, result.duplicate);
        onClose();
      }
    } catch (e) {
      onSaveFailed?.();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return {
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
  };
}
export type CaptureFormModel = ReturnType<typeof useCaptureForm>;
