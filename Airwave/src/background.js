import { ACTIONS, CHANNEL, isYouTube, sanitizeSettings } from './shared.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(console.warn);
});

// Each request is independent, so service-worker suspension never loses a session.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.channel !== CHANNEL || sender.id !== chrome.runtime.id) return;
  const trustedPages = ['panel.html', 'setup.html'].map(path => chrome.runtime.getURL(path));
  if (!trustedPages.includes(sender.url)) return;
  handle(message).then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});

async function handle(message) {
  if (message.type === 'tabs') {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*', ...(Number.isInteger(message.windowId) ? { windowId: message.windowId } : { currentWindow: true }) });
    return { ok: true, tabs: tabs.map(({ id, title, active, url }) => ({ id, title, active, url })) };
  }
  if (!['status', 'command'].includes(message.type) || !Number.isInteger(message.tabId)) {
    throw new Error('Invalid request. Select a YouTube tab.');
  }
  const tab = await chrome.tabs.get(message.tabId);
  if (!isYouTube(tab.url)) throw new Error('This tab is no longer on YouTube. Select another tab.');
  if (message.type === 'command') {
    if (!Object.hasOwn(ACTIONS, message.action)) throw new Error('Unknown action.');
    const window = await chrome.windows.get(tab.windowId);
    if (!tab.active || !window.focused) throw new Error('Return to the selected YouTube tab to control it.');
  }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      channel: CHANNEL, type: message.type, action: message.action,
      settings: sanitizeSettings(message.settings)
    });
    const window = await chrome.windows.get(tab.windowId);
    return { ...result, active: tab.active, windowFocused: window.focused };
  } catch {
    throw new Error('Refresh this YouTube tab once, then try again.');
  }
}
