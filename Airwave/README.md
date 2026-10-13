# Airwave

**Your hands. Your remote.** A Chrome extension that controls YouTube with hand gestures and a webcam. Built as an independent implementation of the UntouchAi internship task.

Includes a ready-to-load Manifest V3 extension, complete editable source, a local AI model, automated tests, and a demo plan. **No API key, account, paid service, or backend is needed.** YouTube itself still needs an internet connection; hand recognition works locally without network requests.

## Run it now — no build required

1. Extract the ZIP fully. On Windows, right-click it → **Extract All**.
2. Open **Google Chrome 116 or newer** on a laptop/desktop with a webcam.
3. Open `chrome://extensions` in Chrome's address bar.
4. Enable **Developer mode** at the top right.
5. Click **Load unpacked** and select **`Airwave/extension`**. This is the folder that contains `manifest.json`. Do not select `Airwave/src` or the outer project folder.
6. Open `https://www.youtube.com`. **Refresh any YouTube tabs that were already open when you installed the extension.**
7. Click Chrome's Extensions puzzle icon, pin **Airwave**, and click its icon. The Airwave side panel opens beside YouTube.
8. Select the YouTube tab in Airwave. Click **Start camera** and accept camera access. First model initialization may take a few seconds.
9. If Chrome blocks the camera prompt in the side panel, click **Camera setup ↗**, grant access on that page, return to YouTube, and click **Start camera** again.
10. Open a video and use the gestures below. Keep the side panel open; closing or hiding it stops the camera.

**Start with Settings → Practice mode** to learn the gestures without affecting playback. Turn Practice mode off when ready. Manual controls work with the camera off, so you can check YouTube connectivity first.

## Gestures

Use one hand, face your palm toward the camera, keep the entire hand in frame, and use good front lighting. The default hold time is **550 ms**. The progress bar shows when a gesture is about to fire.

| Gesture | Action |
| --- | --- |
| Hold an open palm | Play |
| Hold a closed fist | Pause |
| Hold a peace / victory sign | Mute or unmute |
| Hold thumbs up | Increase playback speed by 0.25× |
| Hold thumbs down | Decrease playback speed by 0.25× |
| Raise only your index finger, then move your hand right | Skip forward 10 seconds |
| Raise only your index finger, then move your hand left | Skip backward 10 seconds |
| Raise only your index finger, then move your hand up | Scroll down / next Short |
| Raise only your index finger, then move your hand down | Scroll up / previous Short |

Directions follow the displayed camera preview, which is mirrored by default. Keep your index finger pointing upward while moving the whole hand for swipes. Move about **one sixth of the preview width/height** within **850 ms**. Avoid diagonal movements.

After each action, lower or relax your hand for about **300 ms** before repeating. Holding a pose does not repeatedly fire it. The default global cooldown is **1 second**. You can switch directly to a different stable gesture.

## Features

- Webcam gesture classification with Google's pretrained MediaPipe Gesture Recognizer and 21 hand landmarks.
- Dynamic swipe detection, confidence filtering, stable-pose holds, release-to-repeat behavior, and global cooldown.
- YouTube play/pause, mute, ±5/10/15/30 second seeking, and 0.25×–2× playback speed.
- Scrolling on the home page, search results, and watch pages; dedicated previous/next YouTube Shorts navigation.
- Persistent side panel with a mirrored camera preview, landmark overlay, actual inference timing/FPS, gesture progress, player state, and action feedback.
- Manual playback controls, camera selection, pause/resume recognition, and a practice mode.
- Settings saved in local Chrome extension storage.
- Commands target only the explicitly selected YouTube tab. The tab must be active in a focused Chrome window.
- Camera shutdown on Stop, page hide/unload, camera errors, and target-tab closure.
- Local JS, model, and both SIMD/non-SIMD WASM runtimes. No runtime CDN calls, analytics, microphone access, or video uploads.

## Edit in Antigravity / VS Code

Open the **outer `Airwave` folder** (the one containing `package.json`) in your editor. Use Node.js 20+ and npm.

```powershell
npm ci
npm run build
```

The model is included in `assets/`, so a normal build does not download it. If you intentionally remove it, restore and verify it with:

```powershell
npm run setup
```

After source changes:

1. Run `npm run build`.
2. Close the Airwave panel.
3. Click Airwave's **Reload** button at `chrome://extensions`.
4. Refresh YouTube and reopen Airwave.

There is no `npm run dev` web server. This project runs as a Chrome extension.

## Project layout

| Path | Purpose |
| --- | --- |
| `extension/` | Ready-to-load extension, generated from source |
| `src/panel.*` | Side panel UI, camera lifecycle, and recognition loop |
| `src/setup.*` | Full-page camera permission fallback |
| `src/gesture-engine.js` | Pure gesture timing, swipe, and debounce logic |
| `src/background.js` | Validated messaging and target-tab routing |
| `src/youtube-controller.js` | Video selection, playback, seeking, and Shorts navigation |
| `src/content.js` | Content-script bridge and isolated feedback toast |
| `src/shared.js` | Protocol, settings validation, and action allowlist |
| `assets/` | Model, icon source/PNGs, and upstream license |
| `scripts/` | Reproducible build and verified model download |
| `tests/` | Unit tests and browser integration tests |
| `docs/` | Architecture, QA instructions, and submission/demo guide |

## Tests

Delivery verification: **32 automated tests pass and the extension builds successfully.** The full Chromium integration suite could not run in the development workspace because Chromium's local socket operation is restricted. Run the included live YouTube/webcam checklist on your laptop before recording the submission.

```powershell
npm test
```

For browser integration tests, install Playwright's Chromium and have `ffmpeg` available on your PATH:

```powershell
npx playwright install chromium
npm run build
npm run test:browser
```

The integration test loads the real unpacked extension into Chromium and intercepts YouTube URLs with a deterministic local fixture. It checks real video playback APIs, extension messaging, Shorts buttons, settings, camera lifecycle with a simulated device, and local model inference. It does **not** certify the current live YouTube DOM or recognition accuracy on your own webcam. See [docs/TESTING.md](docs/TESTING.md).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| “Manifest file is missing” | Extract the ZIP first, then choose `Airwave/extension`. |
| “Refresh this YouTube tab” | Reload the YouTube page after loading/reloading Airwave. |
| Camera permission is blocked | Use **Camera setup ↗**. Check Chrome Camera settings and Windows/macOS privacy settings. |
| Camera is busy | Close Zoom/Meet/camera apps, select the correct camera, and retry. |
| Camera started but controls are paused | Return to the selected YouTube tab in the focused Chrome window, or use Practice mode. |
| Play is rejected by Chrome | Click the actual video once, then try the gesture again. Browser autoplay rules can require an initial page interaction. |
| Gestures appear but no action happens | Turn Practice mode off, check the selected tab, and complete the hold. |
| Gestures are inconsistent | Keep the whole hand visible and well lit. Adjust recognition confidence / hold duration. Use one hand at a time. |
| Swipes do not fire | Point the index finger upward first, then move the whole hand in one direction. Lower your hand between swipes. |
| Short won't change | Wait for YouTube to finish loading the next Short. The first Short may have no previous item. YouTube DOM changes may require selector updates. |
| Live stream won't seek | Only streams with a seekable DVR window support skipping. |
| CPU usage is high | Keep one hand in frame; pause recognition or stop the camera when finished. Inference is capped at 15 FPS. |

## Scope and known limits

- Desktop `https://www.youtube.com` only. Not mobile YouTube, embedded videos on other sites, or native apps.
- Keep the side panel visible. Browser fullscreen modes that hide it may stop the camera; restart after leaving fullscreen.
- Recognition depends on lighting, pose, camera quality, and hand visibility. This is a functional prototype, not a measured production accuracy claim.
- Inference runs on the panel's main thread at a capped rate using the CPU delegate. A worker/offscreen inference pipeline is a reasonable next performance iteration.
- Shorts support uses DOM controls with a renderer fallback. It should be manually rechecked against live YouTube before a submission or release.
- Changing audio output volume, moving the mouse, opening arbitrary results, and OS-level controls are outside the requested scope.
- Not published to the Chrome Web Store. No signing, account setup, or public deployment is included.

## References and attribution

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Manifest V3 content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [MediaPipe gesture recognition for the web](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js)
- [MediaPipe model and gesture definitions](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer)

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE). Airwave is an independent project for the supplied task brief, not an official UntouchAi or YouTube product.
