# 0006 · Media fetching and temporary audio

HTTP imports and metadata reads share a DNS-checked fetch with pinned socket addresses, per-redirect validation, and bounded bodies. The media subprocess uses a short-lived loopback proxy for HTTPS CONNECT requests. The proxy applies the same destination policy to CDN hosts and caps transferred bytes. yt-dlp uses its native downloader and a temporary working directory. ffmpeg reads only local files through the permitted media demuxers. Child processes receive a minimal environment.

Audio uploads use the configured storage driver while work is queued or eligible for retry. Completion and deletion enqueue the object for cleanup. ffmpeg normalizes audio to mono PCM, and the worker generates overlapping WAV chunks and stitches their timestamps. Source files, downloaded captions, and normalized audio on the worker's local disk are scoped to a temporary directory.

Apple Podcasts and Spotify direct episode captures keep synchronous RSS identity resolution so re-saving an episode through another directory returns the original item ID. Once identity is established, all media downloads and transcription are queued. Direct article, social and YouTube captures enqueue work immediately.
