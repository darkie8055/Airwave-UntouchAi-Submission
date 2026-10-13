import { ACTIONS, CHANNEL, DEFAULTS, cameraError, sanitizeSettings } from './shared.js';
import { GestureEngine, sampleFromResult } from './gesture-engine.js';

const $ = id => document.getElementById(id);
const video = $('camera-video');
const canvas = $('landmarks');
const context = canvas.getContext('2d');
const engine = new GestureEngine(DEFAULTS);
let settings = { ...DEFAULTS };
let targetId = null;
let targetReady = false;
let stream = null;
let recognizer = null;
let generation = 0;
let running = false;
let starting = false;
let paused = false;
let animationId = null;
let lastFrameAt = 0;
let lastVideoTime = -1;
let pendingCommand = false;
let commandCount = 0;
let statusBusy = false;
let fpsStart = 0;
let frames = 0;
let consecutiveErrors = 0;
let disposed = false;
let panelWindowId;

async function request(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ channel: CHANNEL, type, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Extension unavailable. Reopen the Airwave panel.');
  return response;
}
function showError(message) { $('error-box').textContent = message; $('error-box').hidden = !message; }
function announce(label) {
  $('last-action').textContent = label;
  $('action-count').textContent = `${commandCount} this session`;
}
function formatTime(time) {
  const value = Math.floor(Math.max(0, time || 0));
  return value >= 3600 ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
    : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function renderPlayer(state) {
  $('video-title').textContent = state.title || 'YouTube is connected';
  $('playback-rate').textContent = `${state.rate || 1}×`;
  $('playback-status').textContent = !state.hasVideo ? 'Browse mode · scroll with gestures' : `${state.paused ? 'Paused' : 'Playing'}${state.muted ? ' · Muted' : ''}${state.shorts ? ' · Shorts' : ''}`;
  $('video-time').textContent = state.hasVideo ? `${formatTime(state.time)}${state.duration ? ` / ${formatTime(state.duration)}` : ''}` : '—';
  $('play-button').querySelector('.transport-icon').textContent = state.hasVideo && !state.paused ? 'Ⅱ' : '▶';
}

async function refreshTabs() {
  try {
    const previous = targetId;
    const { tabs } = await request('tabs', { windowId: panelWindowId });
    const select = $('target-tab');
    select.replaceChildren();
    if (!tabs.length) select.add(new Option('Open YouTube to connect', ''));
    for (const tab of tabs) select.add(new Option(tab.title || 'YouTube', String(tab.id)));
    if (tabs.some(tab => tab.id === previous)) select.value = String(previous);
    else {
      if (previous !== null && running) { stopCamera(); showError('The selected YouTube tab closed or navigated away. Select a tab and restart.'); }
      const next = tabs.find(tab => tab.active) || tabs[0];
      select.value = next ? String(next.id) : '';
    }
    targetId = select.value ? Number(select.value) : null;
    if (previous !== targetId) { targetReady = false; engine.reset(); }
    await refreshStatus();
  } catch (error) { showError(error.message); }
}

async function refreshStatus() {
  if (statusBusy || disposed) return;
  if (targetId === null) {
    targetReady = false;
    $('target-status').textContent = 'Open YouTube in this window, then click Refresh.';
    $('video-title').textContent = 'Your next rabbit hole awaits.';
    $('playback-status').textContent = 'No video connected';
    $('video-time').textContent = '—';
    return;
  }
  statusBusy = true;
  const requestedTab = targetId;
  try {
    const result = await request('status', { tabId: requestedTab });
    if (requestedTab !== targetId) return;
    targetReady = result.active && result.windowFocused;
    $('target-status').textContent = targetReady ? 'Connected · controls apply to this tab only' : 'Return to the selected YouTube tab to control it.';
    renderPlayer(result);
  } catch (error) {
    targetReady = false;
    $('target-status').textContent = error.message;
  } finally { statusBusy = false; }
}

async function sendAction(action) {
  if (pendingCommand || !Object.hasOwn(ACTIONS, action)) return;
  if (settings.practice) {
    commandCount++;
    announce(`Practice · ${ACTIONS[action]}`);
    return;
  }
  if (targetId === null) { showError('Open YouTube, then select the tab you want to control.'); return; }
  pendingCommand = true;
  try {
    const result = await request('command', { tabId: targetId, action, settings });
    commandCount++;
    announce(result.label);
    renderPlayer(result);
    showError('');
  } catch (error) { showError(error.message); }
  finally { pendingCommand = false; }
}

function updateCameraUI() {
  const pill = $('camera-status');
  pill.classList.toggle('live', running);
  pill.replaceChildren(Object.assign(document.createElement('i'), {}), document.createTextNode(starting ? 'Starting…' : running ? (paused ? 'Camera on · paused' : 'Camera on') : 'Camera off'));
  $('start-stop').querySelector('span').textContent = starting ? 'Cancel starting' : running ? 'Stop camera' : 'Start camera';
  $('start-stop').classList.toggle('stopping', running || starting);
  $('camera-frame').classList.toggle('running', running);
  $('camera-empty').hidden = running;
  $('camera-live-bottom').hidden = !running;
  $('pause-gestures').hidden = !running;
  $('pause-gestures').textContent = paused ? 'Resume gestures' : 'Pause gestures';
  $('preview-badge').textContent = running ? (settings.practice ? 'PRACTICE' : 'LIVE PREVIEW') : 'PREVIEW';
  $('deviceId').disabled = running || starting;
  video.style.transform = settings.mirror ? 'scaleX(-1)' : 'none';
}

async function startCamera() {
  if (running || starting) return;
  const token = ++generation;
  starting = true;
  showError('');
  $('gesture-label').textContent = 'Waiting for camera…';
  updateCameraUI();
  let acquired;
  try {
    acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 },
      ...(settings.deviceId ? { deviceId: { exact: settings.deviceId } } : {})
    } });
    if (token !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    video.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (running || starting) { stopCamera(); showError('The camera disconnected. Reconnect it and start again.'); }
    }, { once: true });
    await video.play();
    if (token !== generation) return;
    $('gesture-label').textContent = 'Loading local hand tracker…';
    const { GestureRecognizer, FilesetResolver } = await import(chrome.runtime.getURL('vendor/vision_bundle.mjs'));
    const vision = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('vendor/wasm'));
    if (token !== generation) return;
    const model = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath: chrome.runtime.getURL('models/gesture_recognizer.task'), delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      cannedGesturesClassifierOptions: { scoreThreshold: 0.5 }
    });
    if (token !== generation) { model.close(); return; }
    recognizer = model;
    running = true;
    starting = false;
    paused = false;
    consecutiveErrors = 0;
    engine.reset();
    fpsStart = performance.now(); frames = 0; lastFrameAt = 0; lastVideoTime = -1;
    $('gesture-label').textContent = 'Show one hand';
    updateCameraUI();
    await populateCameras();
    if (running) animationId = requestAnimationFrame(frame);
  } catch (error) {
    acquired?.getTracks().forEach(track => track.stop());
    if (token !== generation) return;
    stopCamera();
    showError(cameraError(error));
  }
}

function stopCamera() {
  generation++;
  running = false;
  starting = false;
  paused = false;
  cancelAnimationFrame(animationId);
  animationId = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  try { recognizer?.close(); } catch (error) { console.warn('Tracker cleanup:', error); }
  recognizer = null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  engine.reset();
  setGestureUI('Ready when you are', 0, 0);
  $('inference').textContent = 'No recording. No uploads.';
  $('fps').textContent = '— fps';
  updateCameraUI();
}

function setGestureUI(label, score, progress) {
  // Avoid continually replacing live-region text with the same announcement.
  if ($('gesture-label').textContent !== label) $('gesture-label').textContent = label;
  $('confidence-label').textContent = score ? `${Math.round(score * 100)}%` : '—';
  const percent = Math.round(progress * 100);
  $('gesture-progress').style.width = `${percent}%`;
  $('gesture-progress').parentElement.setAttribute('aria-valuenow', String(percent));
}

const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function drawLandmarks(points) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  context.clearRect(0, 0, w, h);
  if (!settings.showSkeleton || !points?.length) return;
  const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
  const imageW = video.videoWidth * scale, imageH = video.videoHeight * scale;
  const left = (w - imageW) / 2, top = (h - imageH) / 2;
  const map = point => ({ x: left + (settings.mirror ? 1 - point.x : point.x) * imageW, y: top + point.y * imageH });
  const screen = points.map(map);
  context.strokeStyle = '#adffd0'; context.lineWidth = 1.8 * ratio;
  for (const [a, b] of CONNECTIONS) {
    context.beginPath(); context.moveTo(screen[a].x, screen[a].y); context.lineTo(screen[b].x, screen[b].y); context.stroke();
  }
  screen.forEach((point, i) => {
    context.beginPath(); context.arc(point.x, point.y, (i % 4 === 0 ? 3 : 2) * ratio, 0, Math.PI * 2);
    context.fillStyle = i % 4 === 0 ? '#f7e5a0' : '#d5ffdf'; context.fill();
  });
}

function frame(now) {
  if (!running) return;
  animationId = requestAnimationFrame(frame);
  if (paused || (!targetReady && !settings.practice)) {
    engine.reset(); drawLandmarks(null);
    setGestureUI(paused ? 'Gestures paused' : 'Return to YouTube', 0, 0);
    $('hand-indicator').textContent = 'Camera on · controls paused';
    $('fps').textContent = '— fps';
    fpsStart = now; frames = 0;
    return;
  }
  if (now - lastFrameAt < 1000 / 15 || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastFrameAt = now; lastVideoTime = video.currentTime;
  try {
    const start = performance.now();
    const result = recognizer.recognizeForVideo(video, now);
    const elapsed = performance.now() - start;
    consecutiveErrors = 0;
    const sample = sampleFromResult(result);
    const decision = engine.update(sample, now);
    drawLandmarks(result.landmarks?.[0]);
    setGestureUI(decision.label, sample.score, decision.progress);
    $('hand-indicator').textContent = sample.hasHand ? 'One hand tracked' : 'Looking for a hand';
    if (decision.action) void sendAction(decision.action);
    frames++;
    if (now - fpsStart >= 1000) {
      $('fps').textContent = `${Math.round(frames * 1000 / (now - fpsStart))} fps`;
      $('inference').textContent = `${Math.round(elapsed)} ms · on device`;
      frames = 0; fpsStart = now;
    }
  } catch (error) {
    engine.reset();
    if (++consecutiveErrors >= 3) {
      stopCamera(); showError(`Hand tracker stopped: ${error.message}. Try starting the camera again.`);
    }
  }
}

async function populateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const select = $('deviceId');
    select.replaceChildren(new Option('Default camera', ''));
    devices.filter(device => device.kind === 'videoinput' && device.deviceId).forEach((device, i) => select.add(new Option(device.label || `Camera ${i + 1}`, device.deviceId)));
    if (settings.deviceId && ![...select.options].some(option => option.value === settings.deviceId)) select.add(new Option('Previously selected camera (unavailable)', settings.deviceId));
    select.value = settings.deviceId;
  } catch { /* Browser can hide the camera list before permission. */ }
}

function renderSettings() {
  for (const key of ['confidence', 'holdMs', 'cooldownMs', 'swipeDistance']) {
    $(key).value = ['confidence', 'swipeDistance'].includes(key) ? Math.round(settings[key] * 100) : settings[key];
  }
  $('confidence-output').value = `${Math.round(settings.confidence * 100)}%`;
  $('holdMs-output').value = `${settings.holdMs} ms`;
  $('cooldownMs-output').value = `${(settings.cooldownMs / 1000).toFixed(1)} s`;
  $('swipeDistance-output').value = `${Math.round(settings.swipeDistance * 100)}%`;
  $('seekSeconds').value = settings.seekSeconds;
  for (const key of ['mirror', 'showSkeleton', 'practice']) $(key).checked = settings[key];
  $('practice-note').hidden = !settings.practice;
  $('back-label').textContent = $('forward-label').textContent = `${settings.seekSeconds} sec`;
  document.querySelectorAll('.seek-value').forEach(el => el.textContent = `${settings.seekSeconds} seconds`);
  updateCameraUI();
}
async function updateSettings(patch) {
  settings = sanitizeSettings({ ...settings, ...patch });
  engine.configure(settings); engine.reset();
  renderSettings();
  try { await chrome.storage.local.set({ settings }); }
  catch { showError('Could not save preferences. These settings will last for this session.'); }
}

function activateTab(name, focus = false) {
  document.querySelectorAll('[data-tab]').forEach(button => {
    const selected = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`view-${button.dataset.tab}`).hidden = !selected;
    if (selected && focus) button.focus();
  });
}
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    const names = ['control', 'guide', 'settings'];
    let index = names.indexOf(button.dataset.tab);
    if (event.key === 'ArrowRight') index = (index + 1) % names.length;
    else if (event.key === 'ArrowLeft') index = (index + names.length - 1) % names.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = names.length - 1;
    else return;
    event.preventDefault(); activateTab(names[index], true);
  });
});
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => void sendAction(button.dataset.action)));
$('start-stop').addEventListener('click', () => running || starting ? stopCamera() : void startCamera());
$('pause-gestures').addEventListener('click', () => { paused = !paused; engine.reset(); updateCameraUI(); });
$('camera-setup').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') }));
$('refresh-tabs').addEventListener('click', refreshTabs);
$('target-tab').addEventListener('change', () => { targetId = $('target-tab').value ? Number($('target-tab').value) : null; targetReady = false; engine.reset(); showError(''); void refreshStatus(); });
$('reset-settings').addEventListener('click', async () => { if (running || starting) stopCamera(); await updateSettings(DEFAULTS); await populateCameras(); });
for (const key of ['confidence', 'holdMs', 'cooldownMs', 'swipeDistance', 'seekSeconds']) {
  $(key).addEventListener('input', () => void updateSettings({ [key]: Number($(key).value) / (['confidence', 'swipeDistance'].includes(key) ? 100 : 1) }));
}
for (const key of ['mirror', 'showSkeleton', 'practice']) $(key).addEventListener('change', () => void updateSettings({ [key]: $(key).checked }));
$('deviceId').addEventListener('change', () => void updateSettings({ deviceId: $('deviceId').value }));
chrome.tabs.onActivated.addListener(() => { targetReady = false; engine.reset(); void refreshStatus(); });
chrome.tabs.onRemoved.addListener(id => { if (id === targetId) { stopCamera(); targetId = null; void refreshTabs(); } });
chrome.tabs.onUpdated.addListener((id, change) => { if (id === targetId && (change.url || change.status === 'complete')) { targetReady = false; engine.reset(); void refreshTabs(); } });
chrome.windows.onFocusChanged.addListener(() => { targetReady = false; engine.reset(); void refreshStatus(); });
navigator.mediaDevices?.addEventListener('devicechange', populateCameras);
document.addEventListener('visibilitychange', () => { if (document.hidden && (running || starting)) stopCamera(); });
window.addEventListener('pagehide', () => { disposed = true; stopCamera(); clearInterval(statusInterval); });
const statusInterval = setInterval(refreshStatus, 1000);

async function initialize() {
  try {
    panelWindowId = (await chrome.windows.getCurrent()).id;
    const stored = await chrome.storage.local.get('settings');
    settings = sanitizeSettings(stored.settings);
    engine.configure(settings);
    renderSettings();
    await populateCameras();
    await refreshTabs();
  } catch (error) { showError(error.message); }
}
void initialize();
