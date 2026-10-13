export const CHANNEL = 'airwave/v1';
export const DEFAULTS = Object.freeze({
  confidence: 0.65,
  holdMs: 550,
  cooldownMs: 1000,
  swipeDistance: 0.16,
  seekSeconds: 10,
  mirror: true,
  showSkeleton: true,
  practice: false,
  deviceId: ''
});

export const ACTIONS = Object.freeze({
  play: 'Play', pause: 'Pause', toggle_play: 'Play / pause', toggle_mute: 'Mute / unmute',
  seek_forward: 'Skip forward', seek_backward: 'Skip backward',
  speed_up: 'Speed up', speed_down: 'Slow down',
  browse_next: 'Scroll down / next Short', browse_previous: 'Scroll up / previous Short'
});

export function isYouTube(url) {
  try { return new URL(url).origin === 'https://www.youtube.com'; } catch { return false; }
}

export function sanitizeSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const range = (key, min, max) => Number.isFinite(value[key])
    ? Math.min(max, Math.max(min, value[key])) : DEFAULTS[key];
  return {
    confidence: range('confidence', 0.5, 0.9), holdMs: range('holdMs', 300, 1200),
    cooldownMs: range('cooldownMs', 600, 2500), swipeDistance: range('swipeDistance', 0.09, 0.3),
    seekSeconds: [5, 10, 15, 30].includes(value.seekSeconds) ? value.seekSeconds : DEFAULTS.seekSeconds,
    mirror: typeof value.mirror === 'boolean' ? value.mirror : DEFAULTS.mirror,
    showSkeleton: typeof value.showSkeleton === 'boolean' ? value.showSkeleton : DEFAULTS.showSkeleton,
    practice: typeof value.practice === 'boolean' ? value.practice : DEFAULTS.practice,
    deviceId: typeof value.deviceId === 'string' ? value.deviceId.slice(0, 256) : ''
  };
}

export function cameraError(error) {
  const messages = {
    NotAllowedError: 'Camera permission is blocked. Open Camera setup, allow the camera, then try again.',
    NotFoundError: 'No camera found. Connect a webcam and try again.',
    NotReadableError: 'The camera is busy or unavailable. Close other camera apps and try again.',
    OverconstrainedError: 'The selected camera is unavailable. Choose Default camera in Settings.',
    SecurityError: 'Chrome or your device administrator has disabled camera access.'
  };
  return messages[error?.name] || error?.message || 'Something went wrong. Please try again.';
}
