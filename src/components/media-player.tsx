'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

export function MediaPlayer({
  videoId,
  audioUrl,
  localFile,
  title,
  playerRef,
}: {
  videoId?: string;
  audioUrl?: string;
  localFile?: boolean;
  title: string;
  playerRef: Ref<(milliseconds: number) => void>;
}) {
  const [video, setVideo] = useState<{ seconds: number; request: number }>();
  const [localUrl, setLocalUrl] = useState<string>();
  const audio = useRef<HTMLAudioElement>(null);
  const pending = useRef<number | null>(null);
  const player = useRef<HTMLDivElement>(null);
  const source = audioUrl ?? localUrl;

  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    },
    [localUrl],
  );

  function seek(milliseconds: number) {
    const seconds = milliseconds / 1000;
    if (videoId) {
      setVideo((current) => ({
        seconds: Math.floor(seconds),
        request: (current?.request ?? 0) + 1,
      }));
    } else if (audio.current) {
      if (audio.current.readyState) audio.current.currentTime = seconds;
      else pending.current = seconds;
      void audio.current.play().catch(() => {});
    } else if (localFile) {
      pending.current = seconds;
    }
    player.current?.scrollIntoView({ block: 'nearest' });
  }

  useImperativeHandle(playerRef, () => seek);

  return (
    <div className="reading-player" ref={player}>
      {videoId &&
        (video ? (
          <iframe
            key={video.request}
            title={title}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&start=${video.seconds}`}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" onClick={() => seek(0)}>
            Play on YouTube
          </button>
        ))}
      {localFile && (
        <label>
          Open original audio or video for playback
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setLocalUrl(file ? URL.createObjectURL(file) : undefined);
            }}
          />
        </label>
      )}
      {source && (
        <audio
          ref={audio}
          controls
          preload={localFile ? 'metadata' : 'none'}
          src={source}
          onLoadedMetadata={() => {
            if (audio.current && pending.current !== null) {
              audio.current.currentTime = pending.current;
              pending.current = null;
            }
          }}
        />
      )}
    </div>
  );
}
