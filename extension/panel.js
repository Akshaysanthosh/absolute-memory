import { articleUrl, statusLabel, recoveryHint, usesTranscriptPipeline } from './core.mjs';

export function initPanel(chrome, document) {
  const element = (id) => document.getElementById(id);
  const save = element('save');
  const connect = element('connect');
  const open = element('open');
  const preview = element('preview');
  let current;
  let busy = false;
  let revision = 0;
  let actionError = '';
  let panelWindowId;
  let lastPage;
  async function send(message) {
    const reply = await chrome.runtime.sendMessage(message);
    if (!reply?.ok) throw new Error(reply?.error || 'Reload the extension and try again.');
    return reply.data;
  }

  function status(title, detail = '') {
    element('status').textContent = title;
    element('detail').textContent = detail;
    element('detail').hidden = !detail;
  }

  function captureDetail(item) {
    if (item.captureMethod === 'social')
      return 'Sent post text, images and source details from Chrome.';
    if (item.captureMethod === 'page') return 'Sent page content from Chrome.';
    if (item.captureMethod === 'media') return 'Sent the link for transcript processing.';
    return item.captureNotice || '';
  }

  function render(state, tab) {
    const page = tab ? `${tab.id}:${tab.url}` : '';
    if (page !== lastPage) {
      actionError = '';
      lastPage = page;
    }
    current = undefined;
    save.hidden = true;
    connect.hidden = state.connected;
    open.hidden = true;
    preview.hidden = true;
    if (!state.connected) {
      status('Connect your account', state.error || 'Pair this browser to save to your library.');
      return;
    }

    let url;
    try {
      url = articleUrl(tab?.url, state.origin);
    } catch (error) {
      status(
        'This page is unavailable for capture',
        tab?.url
          ? error.message
          : 'Open a webpage and click the Absolute Memory toolbar icon on that tab.',
      );
      return;
    }

    current = { url, tabId: tab.id, windowId: tab.windowId };
    preview.hidden = false;
    element('title').textContent = tab.title || new URL(url).hostname;
    element('domain').textContent = new URL(url).hostname;
    const icon = element('site-icon');
    const iconUrl = /^https?:\/\//i.test(tab.favIconUrl || '') ? tab.favIconUrl : '';
    if (iconUrl !== (icon.getAttribute('src') || '')) {
      icon.hidden = true;
      if (iconUrl) icon.src = iconUrl;
      else icon.removeAttribute('src');
    }

    const item = state.recent.find((entry) => entry.url === url);
    save.textContent = item?.status === 'failed' ? 'Capture again' : 'Save to Absolute Memory';
    save.hidden = Boolean(
      item && ['ready', 'pending', 'processing', 'saving', 'delayed'].includes(item.status),
    );
    if (item?.id && /^[0-9a-f-]{36}$/i.test(item.id)) {
      open.href = new URL('/library', state.origin).href;
      open.textContent = 'Open library';
      open.hidden = false;
    }

    if (actionError) status('Save needs attention', actionError);
    else if (item?.status === 'failed') {
      status(
        'Link saved. Content unavailable.',
        [item.error, recoveryHint(item)].filter(Boolean).join(' '),
      );
      if (usesTranscriptPipeline(url)) save.hidden = true;
    } else if (item?.status === 'retry')
      status('Save could not be confirmed', item.error || 'Try saving again.');
    else if (item?.status === 'delayed')
      status('Saved. Still preparing.', 'Open your library to check the latest status.');
    else if (item) status(statusLabel(item), captureDetail(item));
    else
      status(
        'Ready to save',
        usesTranscriptPipeline(url)
          ? 'Save this link for transcript processing. Availability depends on the source.'
          : 'Save the page content you can see in Chrome.',
      );
  }

  async function refresh() {
    const request = ++revision;
    try {
      const [[tab], state] = await Promise.all([
        chrome.tabs.query({ active: true, windowId: panelWindowId }),
        send({ type: 'view' }),
      ]);
      if (request === revision) render(state, tab);
    } catch (error) {
      if (request === revision) status('Capture panel unavailable', error.message);
    }
  }

  save.addEventListener('click', async () => {
    if (!current || busy) return;
    const target = { ...current };
    busy = true;
    ++revision;
    actionError = '';
    save.disabled = true;
    status('Capturing and saving…');
    try {
      const state = await send({ type: 'save-panel', ...target });
      // Use the acknowledged state immediately; storage events may precede this reply.
      if (current?.tabId === target.tabId && current?.url === target.url) {
        render(state, {
          id: target.tabId,
          windowId: target.windowId,
          url: target.url,
          title: element('title').textContent,
        });
      }
    } catch (error) {
      if (current?.tabId === target.tabId && current?.url === target.url)
        actionError = error.message;
    } finally {
      busy = false;
      save.disabled = false;
      await refresh();
    }
  });

  element('site-icon').addEventListener('load', (event) => {
    event.currentTarget.hidden = false;
  });
  element('site-icon').addEventListener('error', (event) => {
    event.currentTarget.hidden = true;
  });
  for (const button of [connect, element('settings')]) {
    button.addEventListener('click', () => {
      void chrome.runtime
        .openOptionsPage()
        .catch((error) => status('Could not open settings', error.message));
    });
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message.type === 'panel-refresh') void refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.state) void refresh();
  });
  chrome.tabs.onActivated.addListener((info) => {
    if (info.windowId === panelWindowId) void refresh();
  });
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (id === current?.tabId && (change.status === 'complete' || change.url)) void refresh();
  });
  const ready = chrome.windows
    .getCurrent()
    .then((window) => {
      panelWindowId = window.id;
      return refresh();
    })
    .catch((error) => status('Capture panel unavailable', error.message));
  return { ready, refresh };
}
if (typeof document !== 'undefined' && typeof chrome !== 'undefined') initPanel(chrome, document);
