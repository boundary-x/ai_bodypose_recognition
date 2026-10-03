# 👋 Boundary X - AI Body Pose Recognition

**Boundary X - AI Body Pose Recognition** lets learners collect pose examples, train a neural classifier in the browser, and send recognized IDs to a **BBC micro:bit** through Bluetooth UART.

It uses the **official Teachable Machine pose library**: PoseNet heatmaps and offsets feed a trainable neural classifier. A full visible skeleton is **not** required to collect samples. This is no longer a landmark-coordinate KNN classifier.

### 🚀 [Open the Web App](https://boundary-x.github.io/ai_bodypose_recognition/)

**No Node.js installation, account, or AI API key is required.** Open the HTTPS app and allow camera access. Internet access is required to load the libraries and PoseNet weights. The app processes camera frames and trains locally; it does not upload training data to a server.

![Status](https://img.shields.io/badge/Status-Active-success)
![Platform](https://img.shields.io/badge/Platform-Web-blue)
![Stack](https://img.shields.io/badge/Stack-PoseNet%20%7C%20TensorFlow.js-orange)

## ✨ Key Features

### 1. 🎓 Collect Pose Examples

- Add classes as **ID1, ID2, ...**. New IDs reuse the lowest unused number without renumbering other classes.
- **Tap** for one sample or **hold** for repeated collection. Release, pointer cancellation, leaving the button, or leaving the page stops collection. Enter/Space also collects a sample.
- Each sample must come from a fresh processed camera frame; duplicate-frame collection is prevented.
- Upper-body views and partially occluded poses are accepted. Different classes may have different visible joints. The feature-vector layout remains identical for every sample.
- Limits: **20 IDs**, **100 samples per ID**, and **500 samples total**. Feature arrays are much larger than simple joint coordinates, so limits bound browser memory usage.

### 2. 🧠 Train a Neural Classifier

- Collect at least **10 samples in each of two or more classes**, then press **Train Model**. Empty classes must receive samples or be deleted.
- Uses `@teachablemachine/pose`'s actual `TeachablePoseNet.train()` implementation: Dense 100 / ReLU → Dropout 0.5 → Dense / Softmax, with RMSProp, learning rate 0.0001, batch size 16, 30 epochs, and a 15% per-class validation split.
- Displays training progress and supports cancellation. Keep the page open; leaving it cancels ongoing training. Samples are retained after cancellation or failure.
- Adding/deleting IDs or collecting more samples invalidates the previous classifier. Train again before starting recognition.
- Displays **model prediction scores**, not calibrated accuracy measurements.

### 3. 💾 Download, Share & Import

- A version-2 JSON project stores class IDs, samples, settings, and trained classifier weights, if available. Float32 arrays use base64 encoding inside JSON.
- Restore a trained model and start recognition without retraining. A sample-only project requires training after import.
- Files are validated before replacing the current project; replacement requires confirmation. Invalid imports preserve existing data.
- JSON file sharing uses the native share sheet, with download fallback when unsupported.
- Maximum file size: **64 MiB**. No photos, video, or PoseNet backbone weights are included. **Save before refreshing or closing**; there is no automatic persistent storage.
- Earlier `boundary-x-bodypose-knn` files cannot be converted because they contain different features and no original images. Collect new samples. Other apps' files and Teachable Machine website exports cannot be directly imported.

### 4. 🔗 Bluetooth Control

- Sends `ID1`, `ID2`, etc. through Nordic UART Service. Every message ends with a newline.
- During active recognition, sends changed IDs or resends after more than 100 ms since the previous successful write, subject to inference speed.
- A separate person-presence check preserves the hardware stop behavior: at least three PoseNet keypoints with scores ≥0.3 are required for ID transmission. No particular limbs or full-body visibility are required.
- Approximately **500 ms without a valid fresh person detection** triggers `stop`. A returning pose resumes active recognition.
- Explicit stop, camera/data changes, opening the guide, and leaving the page stop recognition. Restart manually afterward.
- Writes are serialized; failed stop writes are retried up to five times. A two-second write timeout disconnects the link.
- A device-side communication watchdog is recommended for moving hardware because browser stop delivery cannot be guaranteed after connection or power loss.

### 5. 📱 Camera & In-App Support

- Automatic camera startup, front/rear switching, and display mirroring.
- Identical **4:3 center crop** for preview and model input, including portrait phone cameras. Skeleton overlays show sufficiently confident joints only.
- Responsive desktop, tablet, and smartphone layouts with sticky camera preview.
- Guided walkthrough, troubleshooting cards, micro:bit name-check and shared ID-receiver examples, update notes, and a lesson-material placeholder.

## 🧭 Quick Start

1. Open the app, allow camera access, and wait for PoseNet to load.
2. Add ID1 and collect at least 10 samples of one pose. Upper-body-only views are allowed.
3. Add ID2 and collect at least 10 samples of another pose. Use similar sample counts and realistic camera framing for every class.
4. Press **Train Model** and wait for completion.
5. Press **Start Recognition**. A micro:bit connection is optional for on-screen testing.
6. For hardware control, install a Bluetooth UART receiver, connect the micro:bit, and handle the exact ID strings and `stop`.
7. Download the model before closing the page.

## 📡 Communication Protocol

UTF-8 strings terminated with `\n`:

| Event | Payload |
| --- | --- |
| ID1 recognized | `ID1\n` |
| ID2 recognized | `ID2\n` |
| Recognition stops / person detection is lost for about 500 ms | `stop\n` |

UART service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`  
Write characteristic: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

Strings are case-sensitive. **Sent** means the Bluetooth write completed, not that the physical robot executed the action.

## 🛠️ Technology & Structure

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Responsive UI and controls |
| `sketch.js` | Camera, async PoseNet extraction, collection/training state, prediction and BLE |
| `pose-model.js` | Feature validation, sample limits and version-2 project format |
| `pose-classifier.js` | Official TM trainer, weight serialization and fixed dense-head inference |
| `pose-runtime.js`, `scripts/runtime-entry.js` | Pinned browser runtime and reproducible bundle entry |
| `training-input.js` | Tap, hold, keyboard and cancellation handling |
| `support.js`, `support.css` | Guided tour and troubleshooting |
| `tests/` | Core and browser integration tests |

Pinned runtime: **TensorFlow.js 4.22.0**, **@teachablemachine/pose 0.8.6**, **PoseNet 2.2.2**, and **p5.js 1.6.0**. A reproducible local bundle resolves TensorFlow dependencies to one version. This is an app-tested integration that overrides the older TM package peer dependency; it is not an upstream compatibility guarantee. Run `npm ci` and `npm run build:runtime` only when rebuilding the checked-in runtime. Website users do not need Node.js.

PoseNet settings: MobileNetV1, multiplier 0.75, input 257, stride 16. Its **17×17×51 heatmap/offset tensor** becomes a **14,739-value** feature vector, as in the official TM implementation. Keypoints are used for drawing and a separate transmission-presence check; they are not the classifier input. There is no hip-centered coordinate normalization.

The final Dense/ReLU/Softmax classifier is evaluated directly from its saved weights in JavaScript (dropout is inactive during inference). This avoids the single-row WebGL prediction inconsistency found during validation. Tests compare this calculation with TensorFlow CPU inference to within 1e-5. PoseNet and training still use TensorFlow.

The app runs one asynchronous inference at a time, at most 10 per second. Inference pauses during model training. Actual speed and memory usage depend on the device; smartphone performance requires physical testing.

## ⚠️ Recognition Limits

- This classifies static poses, not movement order or timing.
- Use one person at a time. The app does not lock onto a person's identity.
- Different visible joints are allowed, but a class that differs only by an invisible limb cannot be reliably distinguished.
- Camera framing, distance, occlusion and lighting can affect predictions. Collect representative examples and a neutral/rest class where appropriate.
- The classifier still chooses a learned class for an unfamiliar detected pose. A high score does not prove correctness.
- Samples can be collected without detected joints, as features still exist. Hardware output intentionally remains stopped while no person is detected; a background class is not sent in that state.
- Display mirroring does not transform the training features. Left/right poses remain distinct.

## 🌐 Browser Compatibility

Use HTTPS or localhost with camera support. Desktop Chrome/Edge and Android Chrome are suitable starting points. Bluetooth requires Web Bluetooth support. On iPhone/iPad, use a supporting browser such as Bluefy for micro:bit control; Safari does not offer that connection. Physical iPhone/Android camera, speed, and BLE acceptance testing remain necessary.

## 🧪 Developer Testing

Node.js is needed only for development tests.

```sh
npm install
npm run test:core
npm run test:browser
```

Browser tests default to an installed Microsoft Edge; set `BROWSER_CHANNEL=chrome` for Chrome. `PLAYWRIGHT_PATH` can point to an existing Playwright installation. Tests load the actual PoseNet and train the actual neural classifier, with synthetic pose features for deterministic checks and mocked BLE. See [VALIDATION.md](VALIDATION.md).

Serve the directory with a static HTTP server for local development. GitHub Pages publishes `main` / root without a build step.

## 🔗 Resources

- [Boundary X](https://boundaryx.io/)
- [Official Teachable Machine pose library](https://github.com/googlecreativelab/teachablemachine-community/tree/master/libraries/pose)
- [Official feature extraction](https://github.com/googlecreativelab/teachablemachine-community/blob/master/libraries/pose/src/custom-posenet.ts)
- [Official neural training implementation](https://github.com/googlecreativelab/teachablemachine-community/blob/master/libraries/pose/src/teachable-posenet.ts)
- [Bluetooth name-check example](https://makecode.microbit.org/S49771-77509-50114-72682)
- [Shared ID-receiver project](https://makecode.microbit.org/57559-53483-63617-50743)

The external Teachable Machine library is Apache-2.0 licensed; TensorFlow.js and PoseNet retain their respective upstream licenses. This app uses their published distributions and does not imply Google endorsement.
