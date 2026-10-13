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
function isYouTube(url) {
  try {
    return new URL(url).origin === "https://www.youtube.com";
  } catch {
    return false;
  }
}
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

// src/background.js
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(console.warn);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.channel !== CHANNEL || sender.id !== chrome.runtime.id) return;
  const trustedPages = ["panel.html", "setup.html"].map((path) => chrome.runtime.getURL(path));
  if (!trustedPages.includes(sender.url)) return;
  handle(message).then(respond).catch((error) => respond({ ok: false, error: error.message }));
  return true;
});
async function handle(message) {
  if (message.type === "tabs") {
    const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*", ...Number.isInteger(message.windowId) ? { windowId: message.windowId } : { currentWindow: true } });
    return { ok: true, tabs: tabs.map(({ id, title, active, url }) => ({ id, title, active, url })) };
  }
  if (!["status", "command"].includes(message.type) || !Number.isInteger(message.tabId)) {
    throw new Error("Invalid request. Select a YouTube tab.");
  }
  const tab = await chrome.tabs.get(message.tabId);
  if (!isYouTube(tab.url)) throw new Error("This tab is no longer on YouTube. Select another tab.");
  if (message.type === "command") {
    if (!Object.hasOwn(ACTIONS, message.action)) throw new Error("Unknown action.");
    const window = await chrome.windows.get(tab.windowId);
    if (!tab.active || !window.focused) throw new Error("Return to the selected YouTube tab to control it.");
  }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      channel: CHANNEL,
      type: message.type,
      action: message.action,
      settings: sanitizeSettings(message.settings)
    });
    const window = await chrome.windows.get(tab.windowId);
    return { ...result, active: tab.active, windowFocused: window.focused };
  } catch {
    throw new Error("Refresh this YouTube tab once, then try again.");
  }
}
