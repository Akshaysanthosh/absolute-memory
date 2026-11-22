import { DEFAULT_ORIGIN, appOrigin, hostPattern, statusLabel, recoveryHint } from './core.mjs';
const $ = (id) => document.getElementById(id);
let busy = false;
async function send(message) {
  const r = await chrome.runtime.sendMessage(message);
  if (!r?.ok) throw new Error(r?.error || 'Please reload the extension and try again.');
  return r.data;
}
function notice(text) {
  $('message').textContent = text || '';
  $('message').hidden = !text;
}
function render(state) {
  $('setup').hidden = state.connected;
  $('connected').hidden = !state.connected;
  $('pair').hidden = !state.pair;
  if (state.pair) $('pair-code').textContent = state.pair.code;
  if (state.connected) {
    $('library').href = state.origin + '/library';
    $('brand').href = state.origin + '/library';
    $('connected-origin').textContent = state.origin;
  }
  $('recent-section').hidden = !state.recent.length;
  $('recent').replaceChildren();
  for (const item of state.recent) {
    const li = document.createElement('li'),
      a = document.createElement('a'),
      status = document.createElement('p');
    a.textContent = item.title;
    a.href = item.id ? `${state.origin}/library` : item.url;
    a.target = '_blank';
    a.rel = 'noopener';
    status.textContent = statusLabel(item);
    li.append(a, status);
    if (item.captureMethod) {
      const method = document.createElement('p');
      method.textContent =
        item.captureMethod === 'social'
          ? 'Sent post text, images and source details from Chrome'
          : item.captureMethod === 'page'
            ? 'Sent article content from Chrome'
            : item.captureMethod === 'media'
              ? 'Sent video link for transcript processing'
              : item.captureNotice || 'Sent URL for server retrieval';
      li.append(method);
    }
    if (item.status === 'retry' && state.connected) {
      const retry = document.createElement('button');
      retry.textContent = 'Try saving again';
      retry.addEventListener('click', () =>
        work(async () => render(await send({ type: 'retry', key: item.key }))),
      );
      li.append(retry);
    }
    if (item.status === 'failed') {
      const hint = document.createElement('p');
      hint.textContent = recoveryHint(item);
      li.append(hint);
    }
    $('recent').append(li);
  }
  if (state.error) notice(state.error);
}
async function work(fn) {
  if (busy) return;
  busy = true;
  notice('');
  $('connect').disabled = true;
  $('disconnect').disabled = true;
  try {
    await fn();
  } catch (e) {
    notice(e.message);
  } finally {
    busy = false;
    $('connect').disabled = false;
    $('disconnect').disabled = false;
  }
}
$('connect-form').addEventListener('submit', (e) => {
  e.preventDefault();
  void work(async () => {
    const origin = appOrigin($('origin').value);
    // This permission is requested only for the selected Absolute Memory server, never for article sites.
    const granted = await chrome.permissions.request({ origins: [hostPattern(origin)] });
    if (!granted) throw new Error('Allow access to your Absolute Memory address to connect.');
    await send({ type: 'connect', origin });
    render(await send({ type: 'view' }));
  });
});
$('check').addEventListener('click', () => work(async () => render(await send({ type: 'check' }))));
$('refresh').addEventListener('click', () =>
  work(async () => render(await send({ type: 'check' }))),
);
$('disconnect').addEventListener('click', () =>
  work(async () => render(await send({ type: 'disconnect' }))),
);
$('brand').addEventListener('click', (e) => {
  if ($('brand').getAttribute('href') === '#') e.preventDefault();
});
async function init() {
  $('extension-version').textContent = 'Version ' + chrome.runtime.getManifest().version;
  const state = await send({ type: 'view' });
  $('origin').value = state.origin || DEFAULT_ORIGIN;
  render(state);
}
void init().catch((e) => notice(e.message));
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local' || area === 'session')
    void send({ type: 'view' })
      .then(render)
      .catch((e) => notice(e.message));
});
setInterval(() => {
  if (!document.hidden && !busy)
    void send({ type: 'check' })
      .then(render)
      .catch(() => {});
}, 4000);
