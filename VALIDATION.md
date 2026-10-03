# Validation

Validated on 2026-10-03 using Node.js 24 and headless Microsoft Edge on Windows.

- Four core test groups pass: translation/scale normalization; cropped, missing and low-visibility joint rejection; arms-up/down KNN separation; JSON round trip and invalid/incompatible-file rejection.
- Real MediaPipe Tasks Vision 0.10.8 and Pose Landmarker Lite assets load and execute detection on a synthetic camera stream.
- After real initialization, deterministic landmark fixtures verify tap, keyboard, hold/release, lowest-free-ID reuse, and class sample counts.
- Mocked Bluetooth receives `ID1\n` and receives `stop\n` after pose loss; training becomes disabled when the pose is unavailable.
- Actual file-input import restores exported samples. Incompatible input preserves the current data.
- Viewports 1280×900, 768×1024, 390×844, 320×740 and 844×390 retain a 4:3 camera and have no horizontal page overflow. Mobile sticky positioning and desktop/mobile screenshots were inspected.
- All 13 guide steps complete; no page JavaScript errors were observed.

Run `npm run test:core` and `npm run test:browser`. `PLAYWRIGHT_PATH` can select an existing Playwright installation; `BROWSER_CHANNEL` defaults to `msedge`. Optional `TEST_URL` runs the browser checks against a deployed site instead of the temporary local server. Tests use synthetic camera frames, synthetic pose landmarks and mocked Bluetooth; they never operate a physical robot.

Physical full-body classification accuracy, iPhone/Bluefy camera behavior, Android device speed, and real micro:bit reception still need hands-on acceptance testing. A loaded model or mocked BLE test is not proof of those results.
