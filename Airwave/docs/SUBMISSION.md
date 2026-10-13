# Submission and demo guide

## What to include

- The project repository or this source ZIP, including `extension/` for easy reviewer installation.
- The README with setup and gesture instructions.
- A short screen recording showing your own webcam gestures and their effect on live YouTube.
- An accurate testing note; automated fixtures are different from a live webcam demonstration.

No submission has been sent. Add your own name, repository link, and recording link when submitting. Review the implementation so you can explain the timing logic, permissions, and design choices during an interview.

## Suggested 90–120 second recording

1. **0:00–0:15 — Install and introduce.** Show Airwave loaded at `chrome://extensions`; open a YouTube video and the panel. Explain that the webcam runs locally and no API key is needed.
2. **0:15–0:30 — Start tracking.** Click Start camera; show the hand landmarks and hold-progress bar. Demonstrate open palm to play and fist to pause.
3. **0:30–0:50 — Player controls.** Show peace sign for mute, thumbs up/down for speed, and index-finger swipes for seeking. Lower your hand between repeated actions.
4. **0:50–1:10 — Browse.** Go to YouTube home/search and scroll using vertical index-finger swipes. Open Shorts and show next/previous navigation.
5. **1:10–1:30 — Product details.** Show sensitivity/hold settings, Practice mode, and manual controls. Stop the camera and show the camera indicator turn off.
6. **Optional extra 20 seconds — Engineering.** Briefly show `gesture-engine.js`, the tests, and the README architecture explanation.

Record only after running the manual checklist in `TESTING.md`. If a gesture fails in your lighting, adjust settings and explain the constraint rather than claiming a measured accuracy figure.

## Short project description

Airwave is a Manifest V3 Chrome extension that enables hands-free YouTube control through webcam gestures. It combines MediaPipe gesture classification with a temporal gesture engine for stable holds, directional swipes, release-to-repeat behavior, and cooldowns. It supports playback, mute, seeking, speed changes, page scrolling, and Shorts navigation. A side panel provides live landmark feedback, configurable settings, practice mode, and manual controls. Model inference runs locally, and the extension only controls the selected active YouTube tab.

## Interview talking points

- A side panel keeps the camera UI available while the user interacts with YouTube.
- MediaPipe supplies pretrained pose predictions; the application's state machine turns noisy predictions into intentional commands.
- Static pose recognition alone cannot distinguish a swipe; swipe direction comes from palm movement over time.
- Open-palm play and fist pause avoid ambiguous toggling. A held mute gesture is latched so it fires once.
- A content script can use standard video APIs without depending on YouTube's private JavaScript internals.
- A stateless worker routes validated messages and rechecks the selected tab on every command.
- Unit tests isolate the temporal logic, while browser tests verify the real extension and media element.
- Main-thread inference and live-site DOM drift are explicit trade-offs and sensible follow-up work.
