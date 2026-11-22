import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initPanel } from '../../extension/panel.js';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function harness() {
  const dom = new JSDOM(readFileSync('extension/panel.html', 'utf8'));
  const el = (id: string) => dom.window.document.getElementById(id) as any;
  let tab = { id: 1, windowId: 7, url: 'https://example.com/a', title: 'Article A' };
  let state: any = { connected: true, origin: 'https://memory.example.test', recent: [] };
  let resolveSave: (value: any) => void = () => {};
  const listeners: any = {};
  const event = (name: string) => ({
    addListener(fn: any) {
      listeners[name] = fn;
    },
  });
  const messages: any[] = [];
  const chrome = {
    windows: {
      async getCurrent() {
        return { id: 7 };
      },
    },
    tabs: {
      async query(query: any) {
        assert.equal(query.windowId, 7);
        return [tab];
      },
      onActivated: event('activate'),
      onUpdated: event('update'),
    },
    storage: { onChanged: event('storage') },
    runtime: {
      id: 'ext',
      onMessage: event('message'),
      async openOptionsPage() {},
      async sendMessage(message: any) {
        messages.push(message);
        if (message.type === 'view') return { ok: true, data: structuredClone(state) };
        return new Promise((resolve) => {
          resolveSave = resolve;
        });
      },
    },
  };
  const panel = initPanel(chrome, dom.window.document);
  return {
    panel,
    el,
    listeners,
    messages,
    setTab(value: any) {
      tab = value;
    },
    setState(value: any) {
      state = value;
    },
    complete(value: any) {
      resolveSave({ ok: true, data: value });
    },
    state: () => state,
  };
}
test('panel shows persisted save completion before message response and keeps completion after response', async () => {
  const h = harness();
  await h.panel.ready;
  h.el('save').click();
  await flush();
  assert.equal(h.el('save').disabled, true);
  const saved = {
    ...h.state(),
    recent: [
      {
        url: 'https://example.com/a',
        id: '11111111-1111-1111-1111-111111111111',
        status: 'ready',
        captureMethod: 'page',
      },
    ],
  };
  h.setState(saved);
  h.listeners.storage({ state: { newValue: saved } }, 'local');
  await flush();
  assert.equal(h.el('status').textContent, 'Saved to your library');
  assert.equal(h.el('open').hidden, false);
  h.complete(saved);
  await flush();
  await flush();
  assert.equal(h.el('status').textContent, 'Saved to your library');
  assert.equal(h.el('save').disabled, false);
  assert.equal(h.messages.find((m: any) => m.type === 'save-panel').url, 'https://example.com/a');
});
test('unrelated windows and background updates do not replace the active tab', async () => {
  const h = harness();
  await h.panel.ready;
  const before = h.messages.length;
  h.listeners.activate({ windowId: 99, tabId: 42 });
  h.listeners.update(42, { status: 'complete' });
  await flush();
  assert.equal(h.messages.length, before);
  assert.equal(h.el('title').textContent, 'Article A');
});
test('save completion on previous tab stays attached to the save that started', async () => {
  const h = harness();
  await h.panel.ready;
  h.el('save').click();
  await flush();
  h.setTab({ id: 2, windowId: 7, url: 'https://example.com/b', title: 'B' });
  h.listeners.activate({ windowId: 7, tabId: 2 });
  await flush();
  const saved = { ...h.state(), recent: [{ url: 'https://example.com/a', status: 'ready' }] };
  h.setState(saved);
  h.complete(saved);
  await flush();
  await flush();
  assert.equal(h.el('status').textContent, 'Ready to save');
  assert.equal(h.el('title').textContent, 'B');
});
test('retry stays visible and pending social result says Preparing', async () => {
  const h = harness();
  await h.panel.ready;
  h.el('save').click();
  await flush();
  const retry = {
    ...h.state(),
    recent: [{ url: 'https://example.com/a', status: 'retry', error: 'Offline' }],
  };
  h.setState(retry);
  h.complete(retry);
  await flush();
  await flush();
  assert.equal(h.el('status').textContent, 'Save could not be confirmed');
  h.setTab({ id: 3, windowId: 7, url: 'https://www.instagram.com/reel/example/', title: 'Reel' });
  h.setState({
    ...h.state(),
    recent: [
      { url: 'https://www.instagram.com/reel/example/', status: 'pending', captureMethod: 'media' },
    ],
  });
  await h.panel.refresh();
  assert.equal(h.el('status').textContent, 'Preparing…');
  assert.equal(h.el('save').hidden, true);
});
