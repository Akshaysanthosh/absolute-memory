# Media capture

| Source                            | What the app can save                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public YouTube video              | Title, metadata, and creator or automatic captions when available. With a transcription provider, it can transcribe downloaded audio when captions are unavailable. |
| Public podcast feed               | Episode metadata and a feed-linked transcript when one is published. With a transcription provider, it can transcribe a publicly reachable audio enclosure.         |
| Apple Podcasts or Spotify episode | The app looks for a public RSS feed and matches the episode. A directory entry alone may produce a saved link.                                                      |
| Public social video               | The app uses yt-dlp when the site permits retrieval. A saved link or visible text can still be available when video or captions are blocked.                        |
| Local audio or video              | Upload supported audio or video with a configured transcription endpoint.                                                                                           |

The Docker image has yt-dlp and FFmpeg. For development, install them on `PATH` or use the image. FFmpeg normalizes audio locally before the configured provider transcribes it. Limits follow [configuration](configuration.md).

Public sources work without signing in when the site serves their content to the instance. Availability varies by site, region, age restrictions, and the media itself. If you have permission to capture an article that requires login, the [Chrome extension](extension.md) can send the loaded page. For authorized yt-dlp downloads that require cookies, mount a Netscape cookies file read-only and set `YTDLP_COOKIES_FILE` to its path inside the instance. Store the file like a credential. [yt-dlp cookie documentation](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)

Timed transcript passages open in the Reader. Select a passage or its play button to seek to the recorded time. YouTube playback loads an embedded player on request. Podcast playback uses the public enclosure through your instance. For uploaded media, the temporary server copy is removed after transcription. You can open the original file from your device to use the Reader's playback controls. [Privacy](privacy.md)
