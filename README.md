# 👋 Boundary X - AI Pose Recognition

Learn poses from camera samples and send recognized IDs to a **micro:bit or ESP32** over Bluetooth. Version 2 uses **MediaPipe Pose Landmarker Lite + landmark KNN** entirely in the browser.

### 🚀 [Open the Web App](https://boundary-x.github.io/ai_bodypose_recognition/)

![Status](https://img.shields.io/badge/Status-Active-success)
![Version](https://img.shields.io/badge/Version-2.0.0-blue)
![Stack](https://img.shields.io/badge/Stack-MediaPipe%20Lite%20%7C%20KNN-orange)

No account, Node.js installation or AI API key is needed to use the app. Allow camera access and keep the page open. Internet access is required to download the runtime and model; camera frames and pose samples are processed locally.

## ✨ Key Features

### 1. 🎓 Collect 10 Samples Automatically

- Add an ID and press **학습하기 · 10개** once.
- A **five-second countdown** gives you time to move away from the mouse and hold a pose.
- Collects one fresh valid sample every **0.5 seconds**, stopping at exactly **10 successful samples** per batch.
- The camera shows the countdown, sample count, progress bar and completion status. Press again to add another batch to the same ID.
- Missing pose data pauses collection; it resumes when valid landmarks return. A batch ends after one minute of collection time if incomplete. Cancellation preserves collected samples.
- Hiding/leaving the page cancels collection. Merely moving focus to another visible window does not cancel it.
- Limits: 20 IDs, 100 samples per ID, 500 total. Starting a batch requires room for all 10 samples. New IDs reuse the lowest unused number.

### 2. 🧠 Recognize Immediately with KNN

- An ID with **at least 10 samples** becomes eligible for recognition without a separate neural-model training step. IDs with fewer samples are excluded from predictions.
- Uses 13 selected landmarks, shoulder-centered/scale-normalized 2D coordinates and a visibility mask: 39 values per sample.
- Both shoulders and at least one other reliable visible landmark are required. A face-and-shoulders view can be collected with wrists outside the frame; one-arm and full-body views are also supported.
- Missing landmarks are not treated as zero-position joints. Comparison considers common landmarks and visibility-pattern differences.
- Five-neighbor weighted voting rejects distant or ambiguous matches. The displayed neighbor vote share is **not calibrated accuracy**.
- Inference runs at most 10 times per second. Actual speed depends on the browser and device; this is not a measured performance guarantee over PoseNet.

### 3. 💾 Download, Share & Import

- Save IDs, normalized pose samples and display-mirroring preference as JSON. No images or videos are included.
- Import validates data before replacing it and asks before overwriting existing samples. Eligible IDs can immediately be recognized.
- Maximum file size: 4 MiB. Native sharing falls back to download when unsupported.
- **Save before refreshing or closing.** Samples are not automatically persisted.
- **Breaking change:** previous PoseNet/Teachable Machine project files cannot be imported. Collect new samples. Earlier unrelated KNN formats are also unsupported.

### 4. 🔗 Bluetooth Control

- Defaults to micro:bit; the board selector also supports ESP32. See [ESP32 support](ESP32_SUPPORT.md) and [receiver example](examples/esp32/README.md).
- Recognition and on-screen data preview work without a Bluetooth connection.
- Sends newline-terminated ID strings. Unknown poses and loss of fresh valid pose input produce `stop`; explicit recognition stop also sends `stop`.
- Changed IDs are sent immediately when possible; repeated output is limited by the 100 ms send interval and inference speed. Writes are serialized.
- Bluetooth disconnection stops recognition. After reconnecting, start recognition again.

### 5. 📱 Camera & Support

- Automatic camera startup; front/rear switching and display mirroring.
- A fixed 4:3 crop is shared by video input and preview, including portrait cameras.
- Contrasting skeleton outlines, larger joints and yellow wrist markers.
- Responsive layout with sticky camera preview, guided walkthrough, device examples and update notes.
- A small display-only Easter egg is included; it never changes inference input or saved samples.

## 🧭 Quick Start

1. Open the app, allow the camera and wait for the pose model.
2. Add ID1, press **학습하기**, and prepare your pose during the five-second countdown.
3. Hold the pose until **10 / 10** appears. Add another ID for a different pose, or collect another batch for the same ID.
4. Press **인식 시작** and check the ID and data preview.
5. For hardware use, install the receiver example, choose the board and connect Bluetooth.
6. Download the samples before leaving.

## 📡 Communication Protocol

UTF-8 strings, case-sensitive, terminated with `\n`:

| Event | Payload |
| --- | --- |
| ID1 recognized | `ID1\n` |
| ID2 recognized | `ID2\n` |
| Unknown pose / pose lost / recognition stopped | `stop\n` |

micro:bit UART service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`  
micro:bit write characteristic: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

The existing board adapter selects the ESP32 characteristic and write method. Successful transmission means the write completed, not that a robot executed it. Hardware receivers should handle `stop` and loss of communication.

## 🛠️ Technology & Structure

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `capture.css` | Responsive controls and collection feedback |
| `sketch.js` | Camera, collection, recognition and Bluetooth state |
| `pose-loader.js` | Pinned MediaPipe runtime and Lite model loading; GPU initialization with CPU fallback |
| `pose-model.js` | Normalization, visibility-aware KNN and JSON validation |
| `training-input.js` | Countdown, fixed-size batches, pause, cancellation and timeout |
| `face-surprise.js` | Display-only face decoration |
| `board-compat.js`, `board-compat.css` | micro:bit/ESP32 adapter |
| `support.js`, `support.css` | Usage guide, examples and update notes |
| `tests/` | Deterministic logic tests and browser regression tests |

Runtime: `@mediapipe/tasks-vision@0.10.22-rc.20250304`, Pose Landmarker Lite float16 model version 1, and p5.js 1.6.0. TensorFlow.js and the Teachable Machine runtime are no longer loaded. GitHub Pages serves the root directory without a build step.

## ⚠️ Recognition Limits

- Classifies static poses, not a sequence of movements.
- Use one person at a time. The app does not identify or lock onto a particular person.
- Hidden hands cannot be reconstructed reliably. Different poses that show the same visible landmarks may be indistinguishable.
- Use representative examples with similar framing and lighting. A change in which joints are visible can affect predictions.
- Rejection thresholds are prototype-tested heuristics, not calibrated probabilities or measured real-world accuracy.
- Display mirroring does not alter training coordinates; left and right remain distinct.
- Inference can block the main thread briefly. Mobile frame rate, battery use and physical Bluetooth reception require testing on target devices.

## 🌐 Browser Compatibility

Use HTTPS or localhost with camera support. Bluetooth requires a browser with Web Bluetooth support. iPhone/iPad hardware connection requires a supporting browser such as Bluefy. Initial runtime/model downloads require network access.

## 🧪 Developer Testing

```sh
npm ci
npm test
npm run test:browser
```

Browser tests use installed Microsoft Edge by default. Set `BROWSER_CHANNEL=chrome` for Chrome or `PLAYWRIGHT_PATH` for an existing Playwright installation. They load the real MediaPipe model, then inject deterministic landmark fixtures into a separate fake-camera test browser. They do not measure human-pose accuracy. See [VALIDATION.md](VALIDATION.md).

## 🔗 Resources

- [Boundary X](https://boundaryx.io/)
- [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
- [Bluetooth name-check example](https://makecode.microbit.org/S49771-77509-50114-72682)
- [Basic ID receiver](https://makecode.microbit.org/57559-53483-63617-50743)

## 📝 Release Notes

**v2.0.0** — MediaPipe Lite + KNN, automatic 10-sample batches, upper-body collection, clearer skeleton and progress display. Previous PoseNet project files require new sample collection. Bluetooth payloads remain unchanged.
