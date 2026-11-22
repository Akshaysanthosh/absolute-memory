import { captureLoadedPage, captureSocialPost } from './page-capture.mjs';
import {
  appOrigin,
  articleUrl,
  pairingProof,
  statusLabel,
  usesTranscriptPipeline,
  isSocialSite,
} from './core.mjs';
import { badgeColor, statusBadge } from './tokens.mjs';
export function createController(chrome, fetcher = fetch) {
  let writes = Promise.resolve(),
    ticking = false;
  const saving = new Set();
  const read = async () => ({ recent: [], ...(await chrome.storage.local.get('state')).state });
  const mutate = (fn) => {
    const job = writes.then(async () => {
      const state = await read();
      await fn(state);
      await chrome.storage.local.set({ state });
      return state;
    });
    writes = job.catch(() => {});
    return job;
  };
  async function request(origin, path, data, token) {
    let r;
    try {
      r = await fetcher(origin + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(data),
      });
    } catch {
      throw new Error(
        'Could not reach Absolute Memory. Check your connection and app address, then try again.',
      );
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(
        j.error || `Absolute Memory could not complete this request (${r.status}).`,
      );
      e.status = r.status;
      throw e;
    }
    return j;
  }
  async function schedule() {
    await chrome.alarms.create('am-sync', { periodInMinutes: 0.5 });
  }
  async function badge(text, color, title) {
    await Promise.all([
      chrome.action.setBadgeText({ text }),
      chrome.action.setBadgeBackgroundColor({ color }),
      chrome.action.setTitle({ title }),
    ]);
  }
  async function begin(origin) {
    origin = appOrigin(origin);
    const state = await read();
    if (state.token) throw new Error('Disconnect the current account before connecting another.');
    const proof = await pairingProof(),
      expires = Date.now() + 10 * 60 * 1000;
    await chrome.storage.session.set({ pair: { ...proof, origin, expires } });
    await schedule();
    await chrome.tabs.create({ url: `${origin}/connect/extension?challenge=${proof.challenge}` });
    return { code: proof.challenge.slice(0, 8).toUpperCase(), expires };
  }
  async function checkPair() {
    const { pair } = await chrome.storage.session.get('pair');
    if (!pair) return;
    if (pair.expires < Date.now()) {
      await chrome.storage.session.remove('pair');
      return;
    }
    const j = await request(pair.origin, '/api/extension/exchange', { verifier: pair.verifier });
    if (j.connected) {
      await mutate((s) => {
        s.origin = pair.origin;
        s.token = j.token;
        s.recent = [];
        s.error = '';
      });
      await chrome.storage.session.remove('pair');
      await badge('', badgeColor.success, 'Save to Absolute Memory');
    }
  }
  async function save(tab) {
    const state = await read();
    if (!state.token) {
      await chrome.runtime.openOptionsPage();
      return;
    }
    let url;
    try {
      url = articleUrl(tab.url, state.origin);
    } catch (e) {
      await badge('!', badgeColor.error, e.message);
      await mutate((s) => {
        s.error = e.message;
      });
      await chrome.runtime.openOptionsPage();
      return;
    }
    if (saving.has(url)) return;
    saving.add(url);
    let captured = tab.captured,
      captureMethod = tab.captureMethod,
      captureNotice = tab.captureNotice;
    const specialist = usesTranscriptPipeline(url);
    if (specialist && !captured?.social) captured = undefined;
    if (!captured && tab.id && chrome.scripting && isSocialSite(url)) {
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: captureSocialPost,
        });
        const page = injection?.result;
        if (page?.social && articleUrl(page.documentUrl, state.origin) === url)
          captured = { social: page.social };
      } catch (e) {
        captureNotice = /Refresh this Instagram page/.test(e?.message || '')
          ? 'Refresh this Instagram page and save again to include its current caption and images.'
          : 'Post details could not be captured. Only the public link was sent.';
      }
    }
    if (!captured && tab.id && chrome.scripting && !specialist && !isSocialSite(url)) {
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: captureLoadedPage,
        });
        const page = injection?.result;
        if (page?.html) {
          if (articleUrl(page.documentUrl, state.origin) === url) captured = { html: page.html };
          else
            captureNotice =
              'The tab navigated during capture. Absolute Memory will try the original public URL instead.';
        }
      } catch (e) {
        const message = typeof e?.message === 'string' ? e.message : '';
        captureNotice =
          message === 'This page is too large for browser capture.'
            ? 'This page exceeds the browser-capture size limit. Absolute Memory will try the public URL instead.'
            : /Cannot access|Missing host permission|permission to access/i.test(message)
              ? 'Chrome did not allow access to the page content. Absolute Memory will try the public URL instead.'
              : 'Chrome could not capture this page. Absolute Memory will try the public URL instead.';
      }
    }
    captureMethod = captured?.social ? 'social' : captured ? 'page' : specialist ? 'media' : 'url';
    if (captureMethod === 'url' && !captureNotice)
      captureNotice =
        'Page content was not captured. Absolute Memory will try the public URL instead.';
    const key = crypto.randomUUID();
    await mutate((s) => {
      s.error = '';
      s.recent = [
        {
          key,
          url,
          title: tab.title || new URL(url).hostname,
          status: 'saving',
          captured,
          captureMethod,
          captureNotice,
          at: Date.now(),
        },
        ...s.recent.filter((x) => x.url !== url),
      ].slice(0, 10);
    });
    await badge('…', badgeColor.pending, 'Saving to Absolute Memory…');
    await schedule();
    try {
      const result = await request(
        state.origin,
        '/api/capture',
        { kind: 'article', url, ...(captured ? { captured } : {}) },
        state.token,
      );
      const saved = {
        ...result,
        status: result.status,
        key,
        url,
        captureMethod,
        captureNotice,
        title: tab.title || new URL(url).hostname,
        at: Date.now(),
      };
      await mutate((s) => {
        if (s.token !== state.token) return;
        s.recent = s.recent.map((x) => (x.key === key ? saved : x));
      });
      await badge(
        result.status === 'ready' ? '✓' : '…',
        result.status === 'ready' ? badgeColor.success : badgeColor.pending,
        statusLabel(saved),
      );
    } catch (e) {
      if (
        captured?.social &&
        e.status === 400 &&
        /expected string, received undefined/i.test(e.message)
      )
        e.message =
          'This Absolute Memory server needs an update to accept social posts. Your capture is kept in this browser for retry. Try again after the server update.';
      await mutate((s) => {
        if (s.token !== state.token) return;
        s.recent = s.recent.map((x) =>
          x.key === key ? { ...x, status: 'retry', error: e.message } : x,
        );
        if (e.status === 401) {
          delete s.token;
          s.error = 'Your connection was revoked. Connect again to save articles.';
        }
      });
      await badge('!', badgeColor.error, e.message);
    } finally {
      saving.delete(url);
    }
  }
  async function saveQuote(info, tab) {
    const state = await read();
    if (!state.token) {
      await chrome.runtime.openOptionsPage();
      return;
    }
    const sourceUrl = articleUrl(info.frameUrl || info.pageUrl, state.origin);
    const text = info.selectionText;
    if (typeof text !== 'string' || !text.trim()) return;
    if (text.length > 12000) {
      await badge('!', badgeColor.error, 'Select up to 12,000 characters for a quote.');
      return;
    }
    const title = (tab?.title || '').slice(0, 300);
    try {
      const result = await request(
        state.origin,
        '/api/capture',
        { kind: 'quote', sourceUrl, title, text },
        state.token,
      );
      await mutate((s) => {
        if (s.token !== state.token) return;
        s.error = '';
        s.recent = [
          {
            key: crypto.randomUUID(),
            id: result.id,
            sourceUrl,
            title: title || 'Saved quote',
            status: 'ready',
            captureMethod: 'quote',
            at: Date.now(),
          },
          ...s.recent.filter((entry) => entry.id !== result.id),
        ].slice(0, 10);
      });
      await badge(
        '✓',
        badgeColor.success,
        result.duplicate ? 'Quote already saved.' : 'Quote saved to Absolute Memory.',
      );
    } catch (error) {
      await mutate((s) => {
        if (s.token !== state.token) return;
        s.error = error.message;
        if (error.status === 401) delete s.token;
      });
      await badge('!', badgeColor.error, error.message);
    }
  }
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      await checkPair().catch(() => {});
      const state = await read();
      if (!state.token) return;
      for (const item of state.recent) {
        if (item.status === 'saving' && Date.now() - item.at > 60000 && !saving.has(item.url)) {
          await mutate((s) => {
            s.recent = s.recent.map((x) =>
              x.key === item.key
                ? { ...x, status: 'retry', error: 'The save was interrupted. Try again.' }
                : x,
            );
          });
          continue;
        }
        if (!['pending', 'processing'].includes(item.status) || !item.receipt) continue;
        if (Date.now() - item.at > 10 * 60 * 1000) {
          await mutate((s) => {
            s.recent = s.recent.map((x) =>
              x.key === item.key
                ? {
                    ...x,
                    status: 'delayed',
                    error: 'Saved. Open your library to check preparation.',
                  }
                : x,
            );
          });
          continue;
        }
        try {
          const j = await request(
            state.origin,
            '/api/capture/status',
            { receipt: item.receipt },
            state.token,
          );
          await mutate((s) => {
            if (s.token !== state.token) return;
            s.recent = s.recent.map((x) =>
              x.key === item.key ? { ...x, status: j.status, error: j.error } : x,
            );
          });
          if (state.recent[0]?.key === item.key) {
            const { icon, color } = statusBadge(j.status);
            await badge(icon, color, statusLabel({ ...item, status: j.status }));
          }
        } catch (e) {
          if (e.status === 401) {
            await mutate((s) => {
              if (s.token !== state.token) return;
              delete s.token;
              s.error = 'Your connection was revoked. Connect again.';
            });
            break;
          }
        }
      }
    } finally {
      ticking = false;
      const state = await read(),
        { pair } = await chrome.storage.session.get('pair');
      if (
        !pair &&
        !state.recent.some((x) => ['pending', 'processing', 'saving'].includes(x.status))
      )
        await chrome.alarms.clear('am-sync');
    }
  }
  async function disconnect() {
    const state = await read();
    // Keep the connection locally if revocation cannot be confirmed.
    if (state.token)
      try {
        await request(state.origin, '/api/extension/disconnect', {}, state.token);
      } catch (e) {
        if (e.status !== 401) throw e;
      }
    await chrome.storage.session.remove('pair');
    await mutate((s) => {
      delete s.token;
      s.recent = [];
      s.error = '';
    });
    await chrome.alarms.clear('am-sync');
    await badge('', badgeColor.pending, 'Connect Absolute Memory to start saving');
  }
  async function view() {
    const state = await read(),
      { pair } = await chrome.storage.session.get('pair');
    return {
      connected: Boolean(state.token),
      origin: state.origin,
      error: state.error,
      recent: state.recent.map(({ receipt, captured, ...item }) => item),
      pair: pair ? { code: pair.challenge.slice(0, 8).toUpperCase(), expires: pair.expires } : null,
    };
  }
  return {
    begin,
    save,
    saveQuote,
    tick,
    disconnect,
    view,
    async init() {
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      await schedule();
      await tick();
    },
    async retry(key) {
      const s = await read(),
        item = s.recent.find((x) => x.key === key);
      if (item) await save(item);
    },
  };
}
