# Testing and manual verification

## Verification status for this delivery

- Source build and bundled manifest/resource checks completed in the development workspace.
- **32 tests passed** on Node.js 24.19.0: gesture engine, settings/seek logic, DOM controller behavior, panel state/error handling, and worker routing. DOM/media and Chrome APIs in these tests use explicit test doubles.
- **The Chromium integration suite is provided but could not run in this workspace.** The runtime blocks the local socket operation required to start Chromium. Browser/model/webcam integration, visual layout, and live YouTube behavior must therefore be checked on your own laptop. No physical webcam or live YouTube run is claimed.

## Automated unit coverage

Run `npm test`. The clock-injected tests cover:

- All five static pose mappings.
- Hold duration and cooldown across gesture changes.
- Latching against repeated mute toggles.
- Brief missing-pose and competing-pose noise.
- Deliberate neutral release and rearming.
- Rejection of unknown/low-confidence poses and stalled frame evidence.
- Four swipe directions, mirroring, tiny movements, and diagonals.
- Empty recognizer results and persisted-settings validation.
- Exact YouTube origin validation.
- VOD and live DVR seeking boundaries, including seekable gaps.
- Visible-video selection, DOM controller commands, bounded speed, autoplay rejection, ad seeking rejection, home-page scrolling, and Shorts controls/fallbacks using a simulated DOM.
- Trusted sender validation, origin/action allowlists, active/focused target checks, and missing-content-script errors using Chrome API test doubles.

## Browser integration test

Prerequisites: Node.js 20+, `npm ci`, `npx playwright install chromium`, and `ffmpeg` on PATH. The optional `CHROMIUM_PATH` environment variable can point to an installed Chromium/Chrome for Testing executable that supports loading unpacked extensions.

Run `npm run build` followed by `npm run test:browser`.

The test launches a **real Manifest V3 unpacked extension** in Chromium. It serves a local fixture in place of YouTube network responses and generates a real 60-second WebM video. Checks include video controls, scrolling without a visible video, Shorts controls, active-tab routing, practice mode, saved settings, local model initialization, fake-camera capture/shutdown, camera setup, model classification of an official MediaPipe test image, and narrow side-panel layouts.

The test's single image fixture is downloaded from `https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg` if it is not already present in the ignored `test-results/` folder. This is a **test-only** network request, not extension behavior. Browser profiles are temporary and removed after the test. Screenshots and generated media stay in `test-results/`, which is not part of the submission ZIP.

These tests establish behavior against a deterministic DOM fixture and simulated capture. They do not measure recognition accuracy on the user's webcam or guarantee that a changing live YouTube layout has identical selectors.

## Before recording your submission

Run these checks on your own Chrome installation and real webcam. These are deliberately left unchecked until you perform them.

- [ ] Install the unpacked extension without Chrome manifest errors.
- [ ] Open and refresh a live YouTube watch page; verify manual Play/Pause first.
- [ ] Grant camera access; verify the camera indicator and preview.
- [ ] In Practice mode, check each static pose and all four swipe directions.
- [ ] Disable Practice mode and verify all five static actions on the real player.
- [ ] Verify forward/back seeking and speed boundaries on a normal video.
- [ ] Hold a peace sign for several seconds; confirm it toggles mute only once.
- [ ] Lower your hand, repeat the sign, and confirm mute toggles again.
- [ ] Navigate to home/search and scroll in both directions with swipes.
- [ ] Open live YouTube Shorts and check both directions when previous/next items exist.
- [ ] Switch to another tab; confirm gestures do not affect the original video.
- [ ] Return to the selected tab; confirm tracking resumes.
- [ ] Navigate between videos without a full page reload; confirm controls still work.
- [ ] Stop the camera and check that Chrome's camera indicator clears.
- [ ] Close the panel while tracking and confirm the camera stops.
- [ ] Test denied permission and a busy/unplugged camera once; confirm understandable errors.
- [ ] Change settings, reopen the panel, and confirm they persist.

## Debugging

- At `chrome://extensions`, inspect Airwave's service worker for routing/permission errors.
- Right-click inside the side panel and choose Inspect for camera/model errors.
- Use the YouTube tab's DevTools console to investigate content-script errors.
- Check that `extension/models/gesture_recognizer.task` and all files in `extension/vendor/wasm/` exist after extracting.
- If YouTube changes its Shorts layout, update the selector list and renderer fallback in `src/youtube-controller.js`, add a representative fixture, rebuild, and repeat the live Shorts checks.

## Performance measurement

The panel reports actual inference time and processed frames per second. It caps inference at 15 FPS; this is a scheduling limit, not a guaranteed device benchmark. No accuracy, latency, or universal compatibility metric is claimed from the supplied automated tests.
