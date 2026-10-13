import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import * as shared from '../src/shared.js';
import * as gestures from '../src/gesture-engine.js';

async function setup() {
  const html = await readFile(new URL('../src/panel.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'chrome-extension://test-extension/panel.html', pretendToBeVisual: true });
  const win = dom.window;
  win.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {} });
  const state = { stored: { settings: { practice: true } }, commands: [] };
  const event = { addListener() {} };
  const navigator = { mediaDevices: {
    enumerateDevices: async () => [], addEventListener() {},
    getUserMedia: async () => { const error = new Error('Denied'); error.name = 'NotAllowedError'; throw error; }
  } };
  const chrome = {
    windows: { getCurrent: async () => ({ id: 7 }), onFocusChanged: event },
    tabs: { onActivated: event, onRemoved: event, onUpdated: event, create: async () => {} },
    storage: { local: { get: async () => state.stored, set: async data => { Object.assign(state.stored, data); } } },
    runtime: {
      getURL: path => `chrome-extension://test-extension/${path}`,
      sendMessage: async message => {
        if (message.type === 'tabs') return { ok: true, tabs: [{ id: 42, title: 'Fixture', active: true }] };
        if (message.type === 'command') state.commands.push(message);
        return { ok: true, title: 'Fixture', active: true, windowFocused: true, hasVideo: true, rate: 1, duration: 60, paused: true, label: 'Done' };
      }
    }
  };
  const source = (await readFile(new URL('../src/panel.js', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/gm, '');
  runInContext(source, createContext({
    ...shared, ...gestures, chrome, navigator, console, window: win, document: win.document,
    Option: win.Option, performance, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setInterval: () => 1, clearInterval() {}
  }));
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush(); await flush();
  return { dom, win, doc: win.document, state, flush };
}

test('panel initializes persisted practice mode, connects a target, and previews actions locally', async () => {
  const { doc, state, flush, dom } = await setup();
  assert.equal(doc.querySelector('#target-tab').value, '42');
  assert.equal(doc.querySelector('#practice').checked, true);
  doc.querySelector('[data-action="speed_up"]').click(); await flush();
  assert.match(doc.querySelector('#last-action').textContent, /Practice/);
  assert.equal(state.commands.length, 0);
  dom.window.close();
});
test('panel persists settings and sends a validated manual action after practice is disabled', async () => {
  const { doc, win, state, flush, dom } = await setup();
  const practice = doc.querySelector('#practice'); practice.checked = false;
  practice.dispatchEvent(new win.Event('change')); await flush();
  doc.querySelector('[data-action="toggle_mute"]').click(); await flush();
  assert.equal(state.commands[0].action, 'toggle_mute');
  assert.equal(state.commands[0].tabId, 42);
  assert.equal(state.stored.settings.practice, false);
  const input = doc.querySelector('#seekSeconds'); input.value = '30'; input.dispatchEvent(new win.Event('input')); await flush();
  assert.equal(state.stored.settings.seekSeconds, 30);
  assert.equal(doc.querySelector('#forward-label').textContent, '30 sec');
  dom.window.close();
});
test('denied camera access resets UI and gives the setup recovery instruction', async () => {
  const { doc, flush, dom } = await setup();
  doc.querySelector('#start-stop').click(); await flush(); await flush();
  assert.match(doc.querySelector('#camera-status').textContent, /Camera off/);
  assert.match(doc.querySelector('#error-box').textContent, /Camera setup/);
  assert.equal(doc.querySelector('#error-box').hidden, false);
  assert.equal(doc.querySelector('#start-stop span').textContent, 'Start camera');
  dom.window.close();
});
