# Third-party notices

Airwave includes the following unmodified third-party components in its ready-to-load extension.

## Google MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision`, pinned to `0.10.32`.
- Source: https://github.com/google-ai-edge/mediapipe
- License: Apache License, Version 2.0. The project's upstream license is copied from `assets/MEDIAPIPE-LICENSE` to `extension/vendor/MEDIAPIPE-LICENSE` during the build.
- The JavaScript module and SIMD/non-SIMD WASM runtimes are distributed locally, with their embedded copyright and license notices preserved.

## MediaPipe Gesture Recognizer model

- Publisher: Google / MediaPipe.
- Version: float16, version 1, unmodified.
- Download: https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task
- Documentation and model card links: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer
- SHA-256: `97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482`.
- MediaPipe is an Apache-2.0 project; retain upstream licensing and attribution when redistributing this model and runtime. Review the linked model card for model limitations.

## Development-only tools

- esbuild: MIT License; https://github.com/evanw/esbuild
- Playwright: Apache-2.0; https://github.com/microsoft/playwright
- jsdom: MIT License; https://github.com/jsdom/jsdom

These build/test dependencies are not shipped as extension runtime code. Airwave is an independent candidate project. It is not an official product of UntouchAi, YouTube, or Google and does not use their logos.
