// Real unpacked-extension integration. Network YouTube is replaced with a local
// fixture so this test is deterministic and does not impersonate live-site QA.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

await mkdir('test-results', { recursive: true });
const fixture = await readFile('tests/fixtures/youtube.html', 'utf8');
// Generate a tiny real video with the system ffmpeg, if not already available.
try { await readFile('test-results/sample.webm'); }
catch {
  execFileSync('ffmpeg', ['-y','-f','lavfi','-i','color=c=0x28483b:s=640x360:r=10','-t','60','-c:v','libvpx','-b:v','80k','-an','test-results/sample.webm'], { stdio: 'ignore' });
}
const media = await readFile('test-results/sample.webm');
const profile = await mkdtemp(`${tmpdir()}/airwave-test-`);
const extension = resolve('extension');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  viewport: { width: 1000, height: 800 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-sandbox',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const failures = [];
const passed = [];
async function check(name, fn) { await fn(); passed.push(name); console.log(`PASS ${name}`); }
try {
  await context.route('https://www.youtube.com/**', async route => {
    if (route.request().url().includes('/airwave-test.webm')) await route.fulfill({ status: 200, body: media, contentType: 'video/webm' });
    else await route.fulfill({ status: 200, body: fixture, contentType: 'text/html' });
  });
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const yt = await context.newPage();
  await yt.goto('https://www.youtube.com/watch?v=airwave-test');
  await yt.waitForFunction(() => document.querySelector('video').readyState >= 2);
  const panel = await context.newPage();
  panel.on('pageerror', error => failures.push(error.message));
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await panel.waitForFunction(() => document.querySelector('#target-tab').value !== '');
  const tabId = Number(await panel.locator('#target-tab').inputValue());
  const invoke = (type, action, other = {}) => panel.evaluate(async ({ type, action, tabId, other }) =>
    chrome.runtime.sendMessage({ channel: 'airwave/v1', type, action, tabId, settings: { seekSeconds: 10 }, ...other }), { type, action, tabId, other });
  await yt.bringToFront();
  await check('real MV3 extension loads and content script responds', async () => {
    const result = await invoke('status'); assert.equal(result.ok, true); assert.equal(result.hasVideo, true);
  });
  await check('play, pause, and mute change a real HTMLMediaElement', async () => {
    assert.equal((await invoke('command', 'play')).ok, true);
    assert.equal(await yt.locator('video').evaluate(v => v.paused), false);
    await invoke('command', 'pause'); assert.equal(await yt.locator('video').evaluate(v => v.paused), true);
    await invoke('command', 'toggle_mute'); assert.equal(await yt.locator('video').evaluate(v => v.muted), true);
    await invoke('command', 'toggle_mute'); assert.equal(await yt.locator('video').evaluate(v => v.muted), false);
  });
  await check('seek and playback rate controls are applied', async () => {
    await yt.locator('video').evaluate(v => { v.currentTime = 20; });
    await invoke('command', 'seek_forward'); assert.ok(Math.abs(await yt.locator('video').evaluate(v => v.currentTime) - 30) < 0.2);
    await invoke('command', 'seek_backward'); assert.ok(Math.abs(await yt.locator('video').evaluate(v => v.currentTime) - 20) < 0.2);
    await invoke('command', 'speed_up'); assert.equal(await yt.locator('video').evaluate(v => v.playbackRate), 1.25);
    await invoke('command', 'speed_down'); assert.equal(await yt.locator('video').evaluate(v => v.playbackRate), 1);
  });
  await check('scrolling works without a video on the home page', async () => {
    await yt.evaluate(() => { history.pushState({}, '', '/'); document.querySelector('video').style.display = 'none'; });
    assert.equal((await invoke('command', 'browse_next')).ok, true);
    await yt.waitForFunction(() => window.scrollY > 100);
    await invoke('command', 'browse_previous');
    await yt.waitForFunction(() => window.scrollY < 10);
  });
  await check('Shorts navigation uses available next/previous controls', async () => {
    await yt.evaluate(() => { history.pushState({}, '', '/shorts/test'); document.body.classList.add('shorts'); document.querySelector('video').style.display = 'block'; });
    await invoke('command', 'browse_next'); await invoke('command', 'browse_previous');
    assert.deepEqual(await yt.evaluate(() => window.navigationCounts), { next: 1, previous: 1 });
  });
  await check('invalid actions and inactive target tabs are rejected', async () => {
    assert.equal((await invoke('command', 'invalid')).ok, false);
    await panel.bringToFront();
    assert.equal((await invoke('command', 'pause')).ok, false);
  });
  await check('settings persist and practice mode never sends playback commands', async () => {
    await panel.locator('#tab-settings').click(); await panel.locator('#practice').check();
    await panel.locator('#seekSeconds').selectOption('15');
    await panel.reload();
    await panel.locator('#tab-settings').click();
    assert.equal(await panel.locator('#practice').isChecked(), true);
    assert.equal(await panel.locator('#seekSeconds').inputValue(), '15');
    await panel.locator('#tab-control').click();
    await panel.locator('[data-action="speed_up"]').click();
    assert.match(await panel.locator('#last-action').innerText(), /Practice/);
    assert.equal(await yt.locator('video').evaluate(v => v.playbackRate), 1);
  });
  await check('local WASM + model initialize and process a fake camera frame', async () => {
    await panel.locator('#start-stop').click();
    await panel.waitForFunction(() => document.querySelector('#camera-status').textContent.includes('Camera on') || !document.querySelector('#error-box').hidden, null, { timeout: 60000 });
    const error = await panel.locator('#error-box').innerText(); assert.equal(error, '', error);
    await panel.waitForFunction(() => /fps/.test(document.querySelector('#fps').textContent) && !document.querySelector('#fps').textContent.includes('—'), null, { timeout: 30000 });
    assert.ok(await panel.locator('#camera-video').evaluate(v => v.srcObject?.getVideoTracks()[0].readyState === 'live'));
    await panel.locator('#start-stop').click();
    assert.equal(await panel.locator('#camera-video').evaluate(v => v.srcObject), null);
    assert.match(await panel.locator('#camera-status').innerText(), /Camera off/);
  });
  await check('the packaged recognizer recognizes an official thumbs-up image', async () => {
    let bytes;
    try { bytes = await readFile('test-results/thumb_up.jpg'); }
    catch {
      const response = await fetch('https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg');
      assert.ok(response.ok); bytes = Buffer.from(await response.arrayBuffer());
    }
    const result = await panel.evaluate(async data => {
      const { GestureRecognizer, FilesetResolver } = await import(chrome.runtime.getURL('vendor/vision_bundle.mjs'));
      const vision = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('vendor/wasm'));
      const model = await GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: chrome.runtime.getURL('models/gesture_recognizer.task'), delegate: 'CPU' }, runningMode: 'IMAGE', numHands: 1 });
      const image = new Image(); image.src = `data:image/jpeg;base64,${data}`; await image.decode();
      try { return model.recognize(image).gestures[0]?.[0]; } finally { model.close(); }
    }, bytes.toString('base64'));
    assert.equal(result.categoryName, 'Thumb_Up'); assert.ok(result.score > 0.65);
  });
  await check('camera permission setup releases its stream', async () => {
    const setup = await context.newPage(); await setup.goto(`chrome-extension://${id}/setup.html`);
    await setup.locator('#allow-camera').click();
    await setup.waitForFunction(() => document.querySelector('#setup-result').textContent.includes('camera is now off'));
    await setup.close();
  });
  await panel.bringToFront();
  await panel.locator('#tab-settings').click(); await panel.locator('#reset-settings').click();
  await panel.locator('#tab-control').click();
  await check('side panel has no horizontal overflow at narrow and wide sizes', async () => {
    for (const width of [320, 380, 520]) {
      await panel.setViewportSize({ width, height: 1100 });
      for (const tab of ['control', 'guide', 'settings']) {
        await panel.locator(`#tab-${tab}`).click();
        assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${tab} at ${width}`);
      }
    }
    await panel.setViewportSize({ width: 380, height: 1200 });
    await panel.locator('#tab-control').click();
    await panel.screenshot({ path: 'test-results/panel.png', fullPage: true });
    await panel.locator('#tab-guide').click();
    await panel.screenshot({ path: 'test-results/guide.png', fullPage: true });
    await panel.locator('#tab-settings').click();
    await panel.screenshot({ path: 'test-results/settings.png', fullPage: true });
  });
  assert.deepEqual(failures, []);
  console.log(`\n${passed.length} integration checks passed. Screenshots: test-results/.`);
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
