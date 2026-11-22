import { createController } from './controller.mjs';
import { articleUrl } from './core.mjs';
const controller = createController(chrome);
const report = () => chrome.action.setBadgeText({ text: '!' });
const quoteMenu = 'am-save-quote';
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === quoteMenu) void controller.saveQuote(info, tab).catch(report);
});
chrome.action.onClicked.addListener((tab) => {
  void chrome.sidePanel
    .open({ windowId: tab.windowId })
    .then(() => {
      // An already-open panel must refresh after the toolbar grants activeTab again.
      void chrome.runtime.sendMessage({ type: 'panel-refresh' }).catch(() => {});
    })
    .catch(report);
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'save-current-page' && tab) void controller.save(tab).catch(report);
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'am-sync') void controller.tick().catch(report);
});
chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: quoteMenu,
      title: 'Save quote to Absolute Memory',
      contexts: ['selection'],
      documentUrlPatterns: ['https://*/*', 'http://*/*'],
    });
  });
  void controller.init().catch(report);
  if (reason === 'install') void chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(() => {
  void controller.init().catch(report);
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const work = async () => {
    if (message.type === 'view') return controller.view();
    if (message.type === 'save-panel' && sender.url === chrome.runtime.getURL('panel.html')) {
      const [tab] = await chrome.tabs.query({ active: true, windowId: message.windowId });
      const state = await controller.view();
      if (!state.connected) throw new Error('Connect Absolute Memory before saving.');
      if (!tab || tab.id !== message.tabId || articleUrl(tab.url, state.origin) !== message.url) {
        throw new Error('The active page changed. Review the preview and try again.');
      }
      await controller.save(tab);
      return controller.view();
    }
    if (message.type === 'connect') return controller.begin(message.origin);
    if (message.type === 'check') {
      await controller.tick();
      return controller.view();
    }
    if (message.type === 'disconnect') {
      await controller.disconnect();
      return controller.view();
    }
    if (message.type === 'retry') {
      await controller.retry(message.key);
      return controller.view();
    }
    throw new Error('Unknown action.');
  };
  void work().then(
    (data) => reply({ ok: true, data }),
    (e) => reply({ ok: false, error: e.message || 'Please try again.' }),
  );
  return true;
});
// Executed on every worker wake, so tokens are never exposed to content scripts.
void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
