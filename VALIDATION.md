# Validation — v2.0.0

Validated with Node.js and headless Microsoft Edge on Windows.

- Real pinned MediaPipe Lite runtime/model initialized in the browser.
- Deterministic landmarks exercise full/partial upper-body, single-arm and face-plus-shoulders inputs; absent shoulders and insufficient landmarks are rejected.
- Normalization, visibility masks, ambiguous-match rejection and JSON round-trip tests pass.
- A five-second countdown precedes collection; missing landmarks pause it; exactly ten successful fresh samples finish a batch. Cancellation and timeout stop additional collection.
- Browser fixtures confirm 10-sample collection, live KNN preview without Bluetooth, cancellation and mobile overflow checks.
- A 320px viewport keeps `10 / 10` on one line with a single progress bar.
- Face-only taps unlock the display decoration at 20; mirror handling and missing-face guards pass.
- Existing micro:bit and ESP32 transport adapter and payload formats are preserved.

Browser pose fixtures test control flow, not real-world recognition accuracy. Human-pose acceptance was reviewed interactively by the user. This release does not claim measured frame-rate improvements, mobile battery benchmarks or new physical Bluetooth validation. Inference remains capped at 10Hz; skeleton latency optimization is deferred.

Run `npm test` and `npm run test:browser`. `PLAYWRIGHT_PATH` can select an existing Playwright installation, and `BROWSER_CHANNEL` defaults to `msedge`.
