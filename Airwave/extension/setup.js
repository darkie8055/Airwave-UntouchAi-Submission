// src/shared.js
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

// src/setup.js
var button = document.querySelector("#allow-camera");
var result = document.querySelector("#setup-result");
var stream;
button.addEventListener("click", async () => {
  button.disabled = true;
  result.textContent = "Waiting for camera permission\u2026";
  result.className = "";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    result.textContent = "Camera access is ready. The camera is now off. Return to YouTube, open Airwave, and click Start camera.";
    result.className = "setup-success";
    button.textContent = "Test camera access again";
  } catch (error) {
    result.textContent = cameraError(error);
  } finally {
    button.disabled = false;
  }
});
window.addEventListener("pagehide", () => stream?.getTracks().forEach((track) => track.stop()));
