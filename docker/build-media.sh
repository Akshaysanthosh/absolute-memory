#!/bin/sh
set -eu

mkdir -p /opt/media/bin /opt/media/notices /tmp/ffmpeg
ffmpeg_archive=/tmp/ffmpeg.tar.xz
curl -fsSL https://ffmpeg.org/releases/ffmpeg-7.1.5.tar.xz -o "$ffmpeg_archive"
printf '%s  %s\n' 'de668509caf9e35e3cd162473441fdb29538c6d96ed080292b3cf9e6fc5d558f' "$ffmpeg_archive" | sha256sum -c -
tar -xJf "$ffmpeg_archive" --strip-components=1 -C /tmp/ffmpeg
cd /tmp/ffmpeg
./configure --disable-programs --enable-ffmpeg --disable-doc --disable-debug --disable-autodetect \
  --disable-network --disable-everything --disable-x86asm --enable-small \
  --enable-protocol=file,pipe --enable-demuxer=aac,flac,matroska,mov,mp3,ogg,wav \
  --enable-parser=aac,ac3,flac,mpegaudio,opus,vorbis \
  --enable-decoder=aac,aac_fixed,ac3,alac,eac3,flac,mp3,mp3float,opus,vorbis,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s32le,pcm_u8,pcm_f32le,pcm_f64le,pcm_mulaw,pcm_alaw \
  --enable-muxer=pcm_s16le --enable-encoder=pcm_s16le \
  --enable-filter=abuffer,abuffersink,aformat,anull,aresample,asetpts,atrim
make -j "$(nproc)" ffmpeg
install -m 0755 ffmpeg /opt/media/bin/ffmpeg
cp COPYING.LGPLv2.1 /opt/media/notices/FFmpeg-LGPL-2.1.txt
printf '%s\n' 'FFmpeg 7.1.5 source: https://ffmpeg.org/releases/ffmpeg-7.1.5.tar.xz' > /opt/media/notices/FFmpeg-source.txt

case "${1:-}" in
  arm64) yt_binary=yt-dlp_linux_aarch64; yt_digest=e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483 ;;
  amd64) yt_binary=yt-dlp_linux; yt_digest=767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795 ;;
  *) echo 'This image supports linux/amd64 and linux/arm64.' >&2; exit 1 ;;
esac
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/$yt_binary" -o /tmp/yt-dlp
printf '%s  %s\n' "$yt_digest" /tmp/yt-dlp | sha256sum -c -
install -m 0755 /tmp/yt-dlp /opt/media/bin/yt-dlp
printf '%s\n' 'yt-dlp 2026.10.26 source and binary notices: https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26' > /opt/media/notices/yt-dlp-source.txt
