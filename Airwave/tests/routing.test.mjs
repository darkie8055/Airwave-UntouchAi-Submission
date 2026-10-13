import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as shared from '../src/shared.js';

// Run the actual worker source with Chrome API test doubles. Explicitly tests
// sender/target boundaries without needing browser IPC in restricted sandboxes.
async function setup() {
  let listener;
  const tab = { id: 42, url: 'https://www.youtube.com/watch?v=test', active: true, windowId: 7 };
  const win = { focused: true };
  const sent = [];
  const chrome = {
    sidePanel: { setPanelBehavior: async () => {} },
    storage: { local: { setAccessLevel: async () => {} } },
    runtime: { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`, onInstalled: { addListener() {} }, onMessage: { addListener: fn => listener = fn } },
    tabs: { query: async () => [tab], get: async () => tab, sendMessage: async (id, message) => { sent.push({ id, message }); return { ok: true }; } },
    windows: { get: async () => win }
  };
  const source = (await readFile(new URL('../src/background.js', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/, '');
  runInContext(source, createContext({ chrome, console, ...shared }));
  const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('panel.html') };
  const ask = (patch = {}, from = sender) => new Promise(resolve => {
    const handled = listener({ channel: shared.CHANNEL, type: 'command', action: 'play', tabId: 42, ...patch }, from, resolve);
    if (!handled) resolve(undefined);
  });
  return { tab, win, sent, ask, chrome };
}
test('worker routes allowlisted controls from the extension panel', async () => {
  const { ask, sent } = await setup();
  const result = await ask(); assert.equal(result.ok, true);
  assert.equal(sent[0].id, 42); assert.equal(sent[0].message.action, 'play');
  assert.equal(sent[0].message.settings.seekSeconds, 10);
});
test('worker ignores external extensions and YouTube content-script senders', async () => {
  const { ask, sent } = await setup();
  assert.equal(await ask({}, { id: 'external', url: 'chrome-extension://test-extension/panel.html' }), undefined);
  assert.equal(await ask({}, { id: 'test-extension', url: 'https://www.youtube.com/watch?v=test' }), undefined);
  assert.equal(sent.length, 0);
});
test('worker rejects wrong origins, inactive tabs, unfocused windows, and unknown actions', async () => {
  const { ask, tab, win, sent } = await setup();
  tab.url = 'https://www.youtube.com.evil.org/watch'; assert.equal((await ask()).ok, false);
  tab.url = 'https://www.youtube.com/watch?v=test'; tab.active = false; assert.equal((await ask()).ok, false);
  tab.active = true; win.focused = false; assert.equal((await ask()).ok, false);
  win.focused = true; assert.equal((await ask({ action: 'bad' })).ok, false);
  assert.equal(sent.length, 0);
});
test('worker can read status from an inactive target and explains missing content scripts', async () => {
  const { ask, tab, chrome } = await setup();
  tab.active = false; assert.equal((await ask({ type: 'status' })).ok, true);
  chrome.tabs.sendMessage = async () => { throw new Error('Could not establish connection'); };
  assert.match((await ask({ type: 'status' })).error, /Refresh this YouTube tab/);
});
