# Request security and local release checks

Browser routes attach a fresh nonce to application scripts in production. Runtime styles and inline style attributes support the existing theme and reader layout. The browser policy allows same-origin images by default. An operator can enable third-party images from saved sources with `ALLOW_REMOTE_IMAGES=true`. YouTube playback loads its iframe after the reader requests playback. Authenticated document bytes use separate routes with explicit content types.

Web capture and integration writes share a per-account token bucket. General API calls and entry points have their own capacities. Lite keeps bounded bucket state in memory. Standard atomically updates bucket state in PostgreSQL, shared between web replicas. A trusted proxy can supply the client address after overwriting it.

The CI workflow and local release script build the same image and run a browser journey with a local article site and mock provider. The Chrome smoke test uses bundled Chromium to load the extension worker. Tag builds run on native AMD64 and ARM64 runners with only read permissions.

The production image omits optional native image optimizer binaries. The app serves its own previews. The licence check inventories the production lockfile and excludes the specifically named optional native variants removed from the image. See [third-party notices](https://github.com/Akshaysanthosh/absolute-memory/blob/main/THIRD_PARTY_NOTICES.md). Hygiene checks cover the working tree and every reachable commit. Exact exceptions cover dependency metadata and a former cache ignore rule in the bootstrap commit, and the single product link requested in the README.
