# Browser extension

Build the Chromium Manifest V3 extension with `npm run extension:zip`. Unzip `dist/absolute-memory-chrome.zip` into a folder. In Chrome or Chromium, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.

Open the extension options and enter the same origin as the instance's `APP_URL`. Local HTTP loopback and HTTPS server origins are supported. The extension requests access to that server when you connect. Sign in to the instance and match the short pairing code shown in the browser and on the approval page.

Click the extension to save the current page. Select text and use the context menu to save a quote. When the loaded-page option is available, the extension can send readable HTML from the current tab so the instance can save pages you have opened after signing in.

Revoke a connection from Absolute Memory Settings. Use the options page to pair with a different server.
