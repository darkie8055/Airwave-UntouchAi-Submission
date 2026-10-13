// src/shared.js
var CHANNEL = "airwave/v1";
var DEFAULTS = Object.freeze({
  confidence: 0.65,
  holdMs: 550,
  cooldownMs: 1e3,
  swipeDistance: 0.16,
  seekSeconds: 10,
  mirror: true,
  showSkeleton: true,
  practice: false,
  deviceId: ""
});
var ACTIONS = Object.freeze({
  play: "Play",
  pause: "Pause",
  toggle_play: "Play / pause",
  toggle_mute: "Mute / unmute",
  seek_forward: "Skip forward",
  seek_backward: "Skip backward",
  speed_up: "Speed up",
  speed_down: "Slow down",
  browse_next: "Scroll down / next Short",
  browse_previous: "Scroll up / previous Short"
});
function sanitizeSettings(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  const range = (key, min, max) => Number.isFinite(value[key]) ? Math.min(max, Math.max(min, value[key])) : DEFAULTS[key];
  return {
    confidence: range("confidence", 0.5, 0.9),
    holdMs: range("holdMs", 300, 1200),
    cooldownMs: range("cooldownMs", 600, 2500),
    swipeDistance: range("swipeDistance", 0.09, 0.3),
    seekSeconds: [5, 10, 15, 30].includes(value.seekSeconds) ? value.seekSeconds : DEFAULTS.seekSeconds,
    mirror: typeof value.mirror === "boolean" ? value.mirror : DEFAULTS.mirror,
    showSkeleton: typeof value.showSkeleton === "boolean" ? value.showSkeleton : DEFAULTS.showSkeleton,
    practice: typeof value.practice === "boolean" ? value.practice : DEFAULTS.practice,
    deviceId: typeof value.deviceId === "string" ? value.deviceId.slice(0, 256) : ""
  };
}
function cameraError(error) {
  const messages = {
    NotAllowedError: "Camera permission is blocked. Open Camera setup, allow the camera, then try again.",
    NotFoundError: "No camera found. Connect a webcam and try again.",
    NotReadableError: "The camera is busy or unavailable. Close other camera apps and try again.",
    OverconstrainedError: "The selected camera is unavailable. Choose Default camera in Settings.",
    SecurityError: "Chrome or your device administrator has disabled camera access."
  };
  return messages[error?.name] || error?.message || "Something went wrong. Please try again.";
}

// src/gesture-engine.js
var POSES = Object.freeze({
  Open_Palm: { action: "play", label: "Open palm" },
  Closed_Fist: { action: "pause", label: "Closed fist" },
  Victory: { action: "toggle_mute", label: "Peace sign" },
  Thumb_Up: { action: "speed_up", label: "Thumbs up" },
  Thumb_Down: { action: "speed_down", label: "Thumbs down" },
  Pointing_Up: { action: null, label: "Point & swipe" }
});
var GestureEngine = class {
  constructor(settings2) {
    this.configure(settings2);
    this.reset();
  }
  configure(settings2) {
    this.settings = sanitizeSettings(settings2);
  }
  reset() {
    this.candidate = null;
    this.since = 0;
    this.lastSeen = null;
    this.neutralSince = null;
    this.lastAction = -Infinity;
    this.latched = false;
    this.firedPose = null;
    this.anchor = null;
    this.previousTime = -Infinity;
  }
  update(sample, now) {
    if (now < this.previousTime || now - this.previousTime > 300) this.clearCandidate();
    this.previousTime = now;
    const pose = sample?.name;
    const confident = POSES[pose] && sample.score >= this.settings.confidence;
    if (!confident) {
      if (this.neutralSince === null) this.neutralSince = now;
      if (now - this.neutralSince >= 260) this.clearCandidate();
      return { label: sample?.hasHand ? "Gesture unclear" : "Show one hand", progress: 0, action: null };
    }
    this.neutralSince = null;
    if (pose !== this.candidate) {
      this.candidate = pose;
      this.since = now;
      this.latched = this.firedPose === pose;
      this.anchor = null;
    }
    this.lastSeen = now;
    const info = { label: POSES[pose].label, progress: 0, action: null };
    if (this.latched) return { ...info, progress: 1, label: "Relax your hand to repeat" };
    if (now - this.lastAction < this.settings.cooldownMs) return { ...info, label: "Ready in a moment" };
    if (pose === "Pointing_Up") {
      if (!sample.position || !Number.isFinite(sample.position.x) || !Number.isFinite(sample.position.y)) return info;
      const point = { x: this.settings.mirror ? 1 - sample.position.x : sample.position.x, y: sample.position.y };
      if (!this.anchor || now - this.anchor.at > 850) {
        this.anchor = { ...point, at: now };
        return { ...info, label: "Point, then swipe" };
      }
      const dx = point.x - this.anchor.x;
      const dy = point.y - this.anchor.y;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      info.progress = Math.min(distance / this.settings.swipeDistance, 1);
      const dominant = Math.max(Math.abs(dx), Math.abs(dy)) > Math.min(Math.abs(dx), Math.abs(dy)) * 1.5;
      if (now - this.anchor.at >= 100 && distance >= this.settings.swipeDistance && distance < 0.65 && dominant) {
        const action = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "seek_forward" : "seek_backward" : dy < 0 ? "browse_next" : "browse_previous";
        return this.fire(action, now, info);
      }
      return info;
    }
    info.progress = Math.min((now - this.since) / this.settings.holdMs, 1);
    if (info.progress >= 1) return this.fire(POSES[pose].action, now, info);
    return info;
  }
  clearCandidate() {
    this.candidate = null;
    this.anchor = null;
    this.latched = false;
    this.firedPose = null;
  }
  fire(action, now, info) {
    this.latched = true;
    this.firedPose = this.candidate;
    this.lastAction = now;
    return { ...info, progress: 1, action };
  }
};
function sampleFromResult(result) {
  const points = result.landmarks?.[0];
  const category = result.gestures?.[0]?.[0];
  return {
    hasHand: Boolean(points?.length),
    name: category?.categoryName || "None",
    score: category?.score || 0,
    // Palm centroid is less jittery than the index fingertip during a swipe.
    position: points?.length >= 18 ? {
      x: (points[0].x + points[5].x + points[9].x + points[17].x) / 4,
      y: (points[0].y + points[5].y + points[9].y + points[17].y) / 4
    } : null
  };
}

// src/panel.js
var $ = (id) => document.getElementById(id);
var video = $("camera-video");
var canvas = $("landmarks");
var context = canvas.getContext("2d");
var engine = new GestureEngine(DEFAULTS);
var settings = { ...DEFAULTS };
var targetId = null;
var targetReady = false;
var stream = null;
var recognizer = null;
var generation = 0;
var running = false;
var starting = false;
var paused = false;
var animationId = null;
var lastFrameAt = 0;
var lastVideoTime = -1;
var pendingCommand = false;
var commandCount = 0;
var statusBusy = false;
var fpsStart = 0;
var frames = 0;
var consecutiveErrors = 0;
var disposed = false;
var panelWindowId;
async function request(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ channel: CHANNEL, type, ...extra });
  if (!response?.ok) throw new Error(response?.error || "Extension unavailable. Reopen the Airwave panel.");
  return response;
}
function showError(message) {
  $("error-box").textContent = message;
  $("error-box").hidden = !message;
}
function announce(label) {
  $("last-action").textContent = label;
  $("action-count").textContent = `${commandCount} this session`;
}
function formatTime(time) {
  const value = Math.floor(Math.max(0, time || 0));
  return value >= 3600 ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}` : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
function renderPlayer(state) {
  $("video-title").textContent = state.title || "YouTube is connected";
  $("playback-rate").textContent = `${state.rate || 1}\xD7`;
  $("playback-status").textContent = !state.hasVideo ? "Browse mode \xB7 scroll with gestures" : `${state.paused ? "Paused" : "Playing"}${state.muted ? " \xB7 Muted" : ""}${state.shorts ? " \xB7 Shorts" : ""}`;
  $("video-time").textContent = state.hasVideo ? `${formatTime(state.time)}${state.duration ? ` / ${formatTime(state.duration)}` : ""}` : "\u2014";
  $("play-button").querySelector(".transport-icon").textContent = state.hasVideo && !state.paused ? "\u2161" : "\u25B6";
}
async function refreshTabs() {
  try {
    const previous = targetId;
    const { tabs } = await request("tabs", { windowId: panelWindowId });
    const select = $("target-tab");
    select.replaceChildren();
    if (!tabs.length) select.add(new Option("Open YouTube to connect", ""));
    for (const tab of tabs) select.add(new Option(tab.title || "YouTube", String(tab.id)));
    if (tabs.some((tab) => tab.id === previous)) select.value = String(previous);
    else {
      if (previous !== null && running) {
        stopCamera();
        showError("The selected YouTube tab closed or navigated away. Select a tab and restart.");
      }
      const next = tabs.find((tab) => tab.active) || tabs[0];
      select.value = next ? String(next.id) : "";
    }
    targetId = select.value ? Number(select.value) : null;
    if (previous !== targetId) {
      targetReady = false;
      engine.reset();
    }
    await refreshStatus();
  } catch (error) {
    showError(error.message);
  }
}
async function refreshStatus() {
  if (statusBusy || disposed) return;
  if (targetId === null) {
    targetReady = false;
    $("target-status").textContent = "Open YouTube in this window, then click Refresh.";
    $("video-title").textContent = "Your next rabbit hole awaits.";
    $("playback-status").textContent = "No video connected";
    $("video-time").textContent = "\u2014";
    return;
  }
  statusBusy = true;
  const requestedTab = targetId;
  try {
    const result = await request("status", { tabId: requestedTab });
    if (requestedTab !== targetId) return;
    targetReady = result.active && result.windowFocused;
    $("target-status").textContent = targetReady ? "Connected \xB7 controls apply to this tab only" : "Return to the selected YouTube tab to control it.";
    renderPlayer(result);
  } catch (error) {
    targetReady = false;
    $("target-status").textContent = error.message;
  } finally {
    statusBusy = false;
  }
}
async function sendAction(action) {
  if (pendingCommand || !Object.hasOwn(ACTIONS, action)) return;
  if (settings.practice) {
    commandCount++;
    announce(`Practice \xB7 ${ACTIONS[action]}`);
    return;
  }
  if (targetId === null) {
    showError("Open YouTube, then select the tab you want to control.");
    return;
  }
  pendingCommand = true;
  try {
    const result = await request("command", { tabId: targetId, action, settings });
    commandCount++;
    announce(result.label);
    renderPlayer(result);
    showError("");
  } catch (error) {
    showError(error.message);
  } finally {
    pendingCommand = false;
  }
}
function updateCameraUI() {
  const pill = $("camera-status");
  pill.classList.toggle("live", running);
  pill.replaceChildren(Object.assign(document.createElement("i"), {}), document.createTextNode(starting ? "Starting\u2026" : running ? paused ? "Camera on \xB7 paused" : "Camera on" : "Camera off"));
  $("start-stop").querySelector("span").textContent = starting ? "Cancel starting" : running ? "Stop camera" : "Start camera";
  $("start-stop").classList.toggle("stopping", running || starting);
  $("camera-frame").classList.toggle("running", running);
  $("camera-empty").hidden = running;
  $("camera-live-bottom").hidden = !running;
  $("pause-gestures").hidden = !running;
  $("pause-gestures").textContent = paused ? "Resume gestures" : "Pause gestures";
  $("preview-badge").textContent = running ? settings.practice ? "PRACTICE" : "LIVE PREVIEW" : "PREVIEW";
  $("deviceId").disabled = running || starting;
  video.style.transform = settings.mirror ? "scaleX(-1)" : "none";
}
async function startCamera() {
  if (running || starting) return;
  const token = ++generation;
  starting = true;
  showError("");
  $("gesture-label").textContent = "Waiting for camera\u2026";
  updateCameraUI();
  let acquired;
  try {
    acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24, max: 30 },
      ...settings.deviceId ? { deviceId: { exact: settings.deviceId } } : {}
    } });
    if (token !== generation) {
      acquired.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = acquired;
    video.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (running || starting) {
        stopCamera();
        showError("The camera disconnected. Reconnect it and start again.");
      }
    }, { once: true });
    await video.play();
    if (token !== generation) return;
    $("gesture-label").textContent = "Loading local hand tracker\u2026";
    const { GestureRecognizer, FilesetResolver } = await import(chrome.runtime.getURL("vendor/vision_bundle.mjs"));
    const vision = await FilesetResolver.forVisionTasks(chrome.runtime.getURL("vendor/wasm"));
    if (token !== generation) return;
    const model = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath: chrome.runtime.getURL("models/gesture_recognizer.task"), delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
      cannedGesturesClassifierOptions: { scoreThreshold: 0.5 }
    });
    if (token !== generation) {
      model.close();
      return;
    }
    recognizer = model;
    running = true;
    starting = false;
    paused = false;
    consecutiveErrors = 0;
    engine.reset();
    fpsStart = performance.now();
    frames = 0;
    lastFrameAt = 0;
    lastVideoTime = -1;
    $("gesture-label").textContent = "Show one hand";
    updateCameraUI();
    await populateCameras();
    if (running) animationId = requestAnimationFrame(frame);
  } catch (error) {
    acquired?.getTracks().forEach((track) => track.stop());
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
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  try {
    recognizer?.close();
  } catch (error) {
    console.warn("Tracker cleanup:", error);
  }
  recognizer = null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  engine.reset();
  setGestureUI("Ready when you are", 0, 0);
  $("inference").textContent = "No recording. No uploads.";
  $("fps").textContent = "\u2014 fps";
  updateCameraUI();
}
function setGestureUI(label, score, progress) {
  if ($("gesture-label").textContent !== label) $("gesture-label").textContent = label;
  $("confidence-label").textContent = score ? `${Math.round(score * 100)}%` : "\u2014";
  const percent = Math.round(progress * 100);
  $("gesture-progress").style.width = `${percent}%`;
  $("gesture-progress").parentElement.setAttribute("aria-valuenow", String(percent));
}
var CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
function drawLandmarks(points) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  context.clearRect(0, 0, w, h);
  if (!settings.showSkeleton || !points?.length) return;
  const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
  const imageW = video.videoWidth * scale, imageH = video.videoHeight * scale;
  const left = (w - imageW) / 2, top = (h - imageH) / 2;
  const map = (point) => ({ x: left + (settings.mirror ? 1 - point.x : point.x) * imageW, y: top + point.y * imageH });
  const screen = points.map(map);
  context.strokeStyle = "#adffd0";
  context.lineWidth = 1.8 * ratio;
  for (const [a, b] of CONNECTIONS) {
    context.beginPath();
    context.moveTo(screen[a].x, screen[a].y);
    context.lineTo(screen[b].x, screen[b].y);
    context.stroke();
  }
  screen.forEach((point, i) => {
    context.beginPath();
    context.arc(point.x, point.y, (i % 4 === 0 ? 3 : 2) * ratio, 0, Math.PI * 2);
    context.fillStyle = i % 4 === 0 ? "#f7e5a0" : "#d5ffdf";
    context.fill();
  });
}
function frame(now) {
  if (!running) return;
  animationId = requestAnimationFrame(frame);
  if (paused || !targetReady && !settings.practice) {
    engine.reset();
    drawLandmarks(null);
    setGestureUI(paused ? "Gestures paused" : "Return to YouTube", 0, 0);
    $("hand-indicator").textContent = "Camera on \xB7 controls paused";
    $("fps").textContent = "\u2014 fps";
    fpsStart = now;
    frames = 0;
    return;
  }
  if (now - lastFrameAt < 1e3 / 15 || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastFrameAt = now;
  lastVideoTime = video.currentTime;
  try {
    const start = performance.now();
    const result = recognizer.recognizeForVideo(video, now);
    const elapsed = performance.now() - start;
    consecutiveErrors = 0;
    const sample = sampleFromResult(result);
    const decision = engine.update(sample, now);
    drawLandmarks(result.landmarks?.[0]);
    setGestureUI(decision.label, sample.score, decision.progress);
    $("hand-indicator").textContent = sample.hasHand ? "One hand tracked" : "Looking for a hand";
    if (decision.action) void sendAction(decision.action);
    frames++;
    if (now - fpsStart >= 1e3) {
      $("fps").textContent = `${Math.round(frames * 1e3 / (now - fpsStart))} fps`;
      $("inference").textContent = `${Math.round(elapsed)} ms \xB7 on device`;
      frames = 0;
      fpsStart = now;
    }
  } catch (error) {
    engine.reset();
    if (++consecutiveErrors >= 3) {
      stopCamera();
      showError(`Hand tracker stopped: ${error.message}. Try starting the camera again.`);
    }
  }
}
async function populateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const select = $("deviceId");
    select.replaceChildren(new Option("Default camera", ""));
    devices.filter((device) => device.kind === "videoinput" && device.deviceId).forEach((device, i) => select.add(new Option(device.label || `Camera ${i + 1}`, device.deviceId)));
    if (settings.deviceId && ![...select.options].some((option) => option.value === settings.deviceId)) select.add(new Option("Previously selected camera (unavailable)", settings.deviceId));
    select.value = settings.deviceId;
  } catch {
  }
}
function renderSettings() {
  for (const key of ["confidence", "holdMs", "cooldownMs", "swipeDistance"]) {
    $(key).value = ["confidence", "swipeDistance"].includes(key) ? Math.round(settings[key] * 100) : settings[key];
  }
  $("confidence-output").value = `${Math.round(settings.confidence * 100)}%`;
  $("holdMs-output").value = `${settings.holdMs} ms`;
  $("cooldownMs-output").value = `${(settings.cooldownMs / 1e3).toFixed(1)} s`;
  $("swipeDistance-output").value = `${Math.round(settings.swipeDistance * 100)}%`;
  $("seekSeconds").value = settings.seekSeconds;
  for (const key of ["mirror", "showSkeleton", "practice"]) $(key).checked = settings[key];
  $("practice-note").hidden = !settings.practice;
  $("back-label").textContent = $("forward-label").textContent = `${settings.seekSeconds} sec`;
  document.querySelectorAll(".seek-value").forEach((el) => el.textContent = `${settings.seekSeconds} seconds`);
  updateCameraUI();
}
async function updateSettings(patch) {
  settings = sanitizeSettings({ ...settings, ...patch });
  engine.configure(settings);
  engine.reset();
  renderSettings();
  try {
    await chrome.storage.local.set({ settings });
  } catch {
    showError("Could not save preferences. These settings will last for this session.");
  }
}
function activateTab(name, focus = false) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === name;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`view-${button.dataset.tab}`).hidden = !selected;
    if (selected && focus) button.focus();
  });
}
document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
  button.addEventListener("keydown", (event) => {
    const names = ["control", "guide", "settings"];
    let index = names.indexOf(button.dataset.tab);
    if (event.key === "ArrowRight") index = (index + 1) % names.length;
    else if (event.key === "ArrowLeft") index = (index + names.length - 1) % names.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = names.length - 1;
    else return;
    event.preventDefault();
    activateTab(names[index], true);
  });
});
document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => void sendAction(button.dataset.action)));
$("start-stop").addEventListener("click", () => running || starting ? stopCamera() : void startCamera());
$("pause-gestures").addEventListener("click", () => {
  paused = !paused;
  engine.reset();
  updateCameraUI();
});
$("camera-setup").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") }));
$("refresh-tabs").addEventListener("click", refreshTabs);
$("target-tab").addEventListener("change", () => {
  targetId = $("target-tab").value ? Number($("target-tab").value) : null;
  targetReady = false;
  engine.reset();
  showError("");
  void refreshStatus();
});
$("reset-settings").addEventListener("click", async () => {
  if (running || starting) stopCamera();
  await updateSettings(DEFAULTS);
  await populateCameras();
});
for (const key of ["confidence", "holdMs", "cooldownMs", "swipeDistance", "seekSeconds"]) {
  $(key).addEventListener("input", () => void updateSettings({ [key]: Number($(key).value) / (["confidence", "swipeDistance"].includes(key) ? 100 : 1) }));
}
for (const key of ["mirror", "showSkeleton", "practice"]) $(key).addEventListener("change", () => void updateSettings({ [key]: $(key).checked }));
$("deviceId").addEventListener("change", () => void updateSettings({ deviceId: $("deviceId").value }));
chrome.tabs.onActivated.addListener(() => {
  targetReady = false;
  engine.reset();
  void refreshStatus();
});
chrome.tabs.onRemoved.addListener((id) => {
  if (id === targetId) {
    stopCamera();
    targetId = null;
    void refreshTabs();
  }
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === targetId && (change.url || change.status === "complete")) {
    targetReady = false;
    engine.reset();
    void refreshTabs();
  }
});
chrome.windows.onFocusChanged.addListener(() => {
  targetReady = false;
  engine.reset();
  void refreshStatus();
});
navigator.mediaDevices?.addEventListener("devicechange", populateCameras);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (running || starting)) stopCamera();
});
window.addEventListener("pagehide", () => {
  disposed = true;
  stopCamera();
  clearInterval(statusInterval);
});
var statusInterval = setInterval(refreshStatus, 1e3);
async function initialize() {
  try {
    panelWindowId = (await chrome.windows.getCurrent()).id;
    const stored = await chrome.storage.local.get("settings");
    settings = sanitizeSettings(stored.settings);
    engine.configure(settings);
    renderSettings();
    await populateCameras();
    await refreshTabs();
  } catch (error) {
    showError(error.message);
  }
}
void initialize();
