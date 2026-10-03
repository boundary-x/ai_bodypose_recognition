# 👋 Boundary X - AI Body Pose Recognition (KNN)

**Boundary X - AI Body Pose Recognition** lets learners collect examples of body poses and classify them directly in the browser using **MediaPipe Pose Landmarker Lite** and a **K-Nearest Neighbors (KNN) classifier**. Recognized IDs can control a **BBC micro:bit** through Bluetooth UART.

### 🚀 [Open the Web App](https://boundary-x.github.io/ai_bodypose_recognition/)

**No Node.js installation, account, or AI API key is required to use the published app.** Allow camera access on the HTTPS website. Internet access is required to download libraries and the pose model. Camera frames and learned features are processed locally; the app does not upload them to a server.

![Status](https://img.shields.io/badge/Status-Active-success)
![Platform](https://img.shields.io/badge/Platform-Web-blue)
![Stack](https://img.shields.io/badge/Stack-MediaPipe%20%7C%20KNN-orange)

## ✨ Key Features

### 1. 🎓 Body Pose Learning

- Add classes as **ID1, ID2, ...**. New classes reuse the lowest unused ID; deleting a class does not renumber the others.
- **Tap** a class's training button for one sample or **hold** it to collect repeatedly. Release, cancel, leave the button, lose the pose, or leave the page to stop collecting. Enter/Space collects one sample.
- Each sample requires a fresh valid detection. A frame cannot be collected twice.
- Uses **12 joints**: both shoulders, elbows, wrists, hips, knees, and ankles. All must be inside the image with visibility of at least **0.6**.
- Extracts **24 x/y features**, relative to the hip midpoint, with image-aspect correction and maximum-radius normalization. This reduces sensitivity to image position and apparent body size; camera viewpoint and body rotation still matter.
- Supports **100 IDs**, **500 samples per ID**, and **2,000 samples total**.
- Shows skeletons, per-class sample counts, recognized IDs, and **KNN vote share**. Vote share is not a calibrated accuracy probability.

### 2. 💾 Model Download, Share & Import

- Download a JSON project containing IDs, feature samples, engine settings, and display-mirror preference.
- Share the JSON using the device's share sheet; unsupported file sharing falls back to download.
- Import validated projects exported by this app, with confirmation before replacing existing data.
- Files use `boundary-x-bodypose-knn`, version 1, with an **8 MiB** limit. Hand-pose and image-classification model files are incompatible.
- Files contain no photos or video and do not include the MediaPipe model weights. **Download before refreshing or closing**: there is no automatic persistent storage.

### 3. 🔗 Bluetooth Hardware Control

- Connect to micro:bit using Nordic UART Service through Web Bluetooth.
- During active recognition, send the winning class ID when it changes or more than 100 ms has elapsed since the last successful write.
- About **500 ms without a valid fresh full-body pose** triggers `stop`. A returning pose resumes active recognition.
- Explicit recognition stop, data changes, camera changes, opening the guided tour, and leaving the page stop active recognition. After those actions, start recognition again manually.
- Writes are serialized. Failed stop writes are retried up to five times; a two-second write timeout disconnects the link.
- A device-side communication watchdog is recommended for moving hardware: browser stop delivery cannot be guaranteed after a connection or power failure.

### 4. 📱 Camera, Layout & Support

- Starts the camera automatically; offers front/rear switching and display mirroring.
- Uses the **same 4:3 center crop** for preview, skeleton drawing, and inference, including portrait phone cameras. Stand far enough away for wrists and ankles to remain visible.
- Sticky camera preview, responsive smartphone/tablet/desktop layouts, and the shared Boundary X design.
- Guided walkthrough, troubleshooting cards, Bluetooth name-check and shared ID-receiver example links, update notes, and a lesson-material placeholder.

## 🧭 Quick Start

1. Open the app, allow camera access, and wait for the pose model to load.
2. Place the camera so **one person's full body**, including wrists and ankles, is visible.
3. Add ID1, hold a distinct pose, and tap or hold its training button.
4. Add ID2 and collect another pose. Collect similar numbers of samples for each ID while varying position and distance slightly.
5. Press **Start Recognition** and compare the results. Bluetooth is optional for on-screen recognition.
6. To control micro:bit, install a Bluetooth UART receiver program, connect it, and handle the exact ID strings and `stop`.
7. Download or share your model before leaving the page.

## 📡 Communication Protocol

UTF-8 strings terminated with a newline (`\n`):

| Event | Payload |
| --- | --- |
| ID1 recognized | `ID1\n` |
| ID2 recognized | `ID2\n` |
| Recognition stopped / full-body pose unavailable for about 500 ms | `stop\n` |

UART service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`  
Write characteristic: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

Strings are case-sensitive. The app's **Sent** indicator means the Bluetooth write completed, not that the robot executed the action.

## 🛠️ Technology & Project Structure

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Responsive interface and camera controls |
| `sketch.js` | Camera crop, Pose Lite inference, skeleton drawing, UI, and Bluetooth |
| `pose-model.js` | Pure normalized features, KNN voting, and JSON validation |
| `training-input.js` | Tap, hold, keyboard, and cancellation handling |
| `support.js`, `support.css` | In-app guide and troubleshooting |
| `tests/` | Core tests and browser integration checks |

MediaPipe Tasks Vision is pinned to **0.10.8**; Pose Landmarker Lite float16 model version **1**; p5.js **1.6.0**. GPU initialization falls back to CPU. Detection is limited to at most **10 frames per second** and one person, with segmentation disabled. Actual speed varies by hardware, browser, and thermal conditions.

## ⚠️ Recognition Limits

- Classifies **static poses**, not the order or timing of movements.
- Requires one visible person. It does not lock onto a particular identity when several people appear.
- KNN always selects a learned class for a valid pose, including unfamiliar poses. Add a neutral/rest class if needed.
- Occlusion, cropped limbs, poor light, side views, and similar poses can reduce reliability.
- This version compares 2D joint geometry; depth-only differences may be difficult to distinguish.
- Mirroring affects the display only. Left/right poses are not automatically treated as equivalent.

## 🌐 Browser Compatibility

Use an HTTPS browser with camera and WebAssembly support. Desktop Chrome/Edge and Android Chrome are suitable starting points. On iPhone/iPad, a browser with Web Bluetooth support, such as Bluefy, is needed for micro:bit control; Safari does not provide that connection. Physical-device performance and BLE behavior must be checked on the target device. No guaranteed frame rate is claimed.

## 🧪 Developer Testing

Node.js is only needed for development tests, not for using the app.

```sh
npm install
npx playwright install chromium
npm run test:core
```

Run browser tests with an installed Microsoft Edge by running `npm run test:browser`, or set `BROWSER_CHANNEL=chrome` for Chrome. The suite loads the real online Pose Lite assets, then uses synthetic landmarks and a mocked BLE characteristic to verify application behavior. It does not connect to real hardware. See [VALIDATION.md](VALIDATION.md).

For local use, serve this directory with any static HTTP server on localhost. Production deployment uses GitHub Pages from `main` / root; no build step is needed.

## 🔗 Resources

- [Boundary X](https://boundaryx.io/)
- [MediaPipe Pose Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Bluetooth name-check example](https://makecode.microbit.org/S49771-77509-50114-72682)
- [Shared ID-receiver project](https://makecode.microbit.org/57559-53483-63617-50743)

Complete the example's conditional with `ID1`, add additional IDs as needed, and implement a stop action for `stop`.
