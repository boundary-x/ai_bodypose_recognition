# Validation

Validated on 2026-10-03 with Node.js 24 and headless Microsoft Edge on Windows.

- Five core groups pass: fixed PoseNet feature validation, partial-pose presence, float32 encoding, minimum sample/class requirements, and project validation.
- Real bundled PoseNet loads and extracts 14,739 heatmap/offset features from a synthetic camera.
- Partial upper-body fixtures can be collected with tap/hold. Duplicate frames are rejected. Training needs two classes with at least ten samples each.
- Official Teachable Machine training completes for two distinct synthetic feature classes and distinguishes both classes.
- Direct Dense/ReLU/Softmax inference matches an independently constructed TensorFlow CPU model within 1e-5.
- Export/import through the actual file input preserves prediction scores. Malformed and legacy KNN files do not replace current data.
- Training cancellation preserves samples and the previous model. Adding samples invalidates the old classifier. Deleted IDs can be reused.
- Mocked BLE writes include recognized IDs and stop after person loss. Camera-independent collection is not blocked by a whole-body requirement.
- Desktop, tablet, portrait and landscape viewports retain a 4:3 preview without page overflow. All 13 tour steps complete.
- No page JavaScript exceptions occurred.

The final inference head directly evaluates saved weights because the tested WebGL single-row classifier predictions differed from serialized-weight predictions. Tests verify the direct calculation against TensorFlow CPU, rather than assuming GPU and saved models agree. PoseNet and model training retain TensorFlow acceleration.

Run npm run test:core and npm run test:browser. PLAYWRIGHT_PATH can select an installed Playwright package; BROWSER_CHANNEL defaults to msedge. Tests use synthetic camera/pose data and mocked Bluetooth.

Real pose accuracy, iPhone/Bluefy camera behavior, Android training speed, and physical micro:bit reception still require hands-on testing. Synthetic two-class separation is not a measured real-world accuracy claim.
