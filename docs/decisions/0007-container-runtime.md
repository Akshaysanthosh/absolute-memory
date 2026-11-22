# 0007 · Compose roles and container media tools

The same image runs the embedded app, the Standard web service, and the Standard worker. Web and worker containers point to the same PostgreSQL database and file volume. The entrypoint applies pending migrations before launching the role. A worker records a heartbeat every 30 seconds. The web health route checks migration and pgvector availability, and the worker health check uses the persisted heartbeat.

The image uses the standalone Next.js output plus the server dependencies required by the worker and administrative CLI. The media stage builds FFmpeg 7.1.5 from its checksum-verified upstream source. The build enables local audio and video containers, audio decoders, resampling, and PCM output. It excludes networking from FFmpeg because enclosure and audio retrieval is handled by the app. The stage pins and verifies the upstream yt-dlp binary for each target architecture.
