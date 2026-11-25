# Absolute Memory documentation site

Run the site locally with Node.js 22 and npm.

```sh
npm ci --prefix website
npm run website:dev
```

Open [localhost:3000](http://localhost:3000). Pass `--port 3001` after `--` if the app uses port 3000.

```sh
npm run website:build
```

The production build checks internal links and anchors. The site reads the same [guides](../docs/README.md) as GitHub. Approved screenshots and media are copied by the site build into an ignored static directory. The app and its Docker image use their own lockfile and build.

<!-- TODO(owner): domain -->
