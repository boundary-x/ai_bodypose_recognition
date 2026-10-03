/* Boundary X — MediaPipe Pose Lite + body-pose KNN. */
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const SEND_INTERVAL = 100;
const POSE_FRESH_MS = 500;
let video, poseLandmarker;
let isModelReady = false, modelLoadFailed = false;
let lastLandmarks = null, lastFeatures = null, lastVideoTime = -1;
let frameId = 0, lastSampleFrame = -1, lastPoseSeenAt = -Infinity;
let poseAvailable = false, poseLossSent = false;
let trainingData = [], classIds = [], nextClassId = 1;
let isTracking = false, isBusy = false, isFlipped = true;
let trackingEpoch = 0, training;
let bluetoothDevice = null, rxCharacteristic = null;
let isConnected = false, isConnecting = false, isManualDisconnect = false;
let bluetoothStatus = "연결 대기 중", lastSentLabel = "", lastSendTime = 0;
let sendQueue = Promise.resolve(), predictionSendPending = false;
const byId = id => document.getElementById(id);
const setText = (id, text) => { byId(id).textContent = text; };
const fileStatus = message => setText("file-status", message);
const trainingStatus = message => setText("training-status", message);

let facingMode='user', cameraBusy=false, lastInferenceAt=0;
let frameCanvas, frameContext;
function setup() {
  createCanvas(640,480).parent('p5-container');
  pixelDensity(1); frameRate(30);
  video={elt:document.createElement('video')};
  video.elt.muted=true; video.elt.playsInline=true;
  video.elt.setAttribute('playsinline','');
  video.elt.className='camera-source'; document.body.appendChild(video.elt);
  frameCanvas=document.createElement('canvas'); frameCanvas.width=640; frameCanvas.height=480;
  frameContext=frameCanvas.getContext('2d');
  createUI();
  byId('switch-camera').onclick=()=>{facingMode=facingMode==='user'?'environment':'user';startCamera();};
  byId('mirror-camera').onclick=()=>{isFlipped=!isFlipped;byId('mirror-camera').setAttribute('aria-pressed',String(isFlipped));};
  byId('retry-camera').onclick=startCamera;
  startCamera(); initMediaPipe();
}
async function startCamera() {
  if(cameraBusy) return;
  cameraBusy=true; byId('switch-camera').disabled=true;
  stopForChange(); invalidatePose(); lastVideoTime=-1;
  if(video.elt.srcObject) video.elt.srcObject.getTracks().forEach(t=>t.stop());
  video.elt.srcObject=null;
  setText('camera-status','카메라 연결 중…');
  try {
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:640},height:{ideal:480}}});
    video.elt.srcObject=stream; await video.elt.play();
    stream.getVideoTracks()[0].addEventListener('ended',()=>{stopForChange();invalidatePose();setText('camera-status','카메라 연결이 끊겼습니다. 다시 시도해주세요.');byId('retry-camera').hidden=false;});
    setText('camera-status','발목까지 전신이 보이도록 카메라에서 충분히 떨어져주세요.');
    byId('retry-camera').hidden=true;
  } catch(error) {
    const reasons={NotAllowedError:'카메라 권한을 허용해주세요.',NotFoundError:'카메라를 찾을 수 없습니다.',NotReadableError:'다른 앱이 카메라를 사용 중인지 확인해주세요.'};
    setText('camera-status',reasons[error.name]||'카메라 오류: '+error.message); byId('retry-camera').hidden=false;
  } finally {cameraBusy=false;byId('switch-camera').disabled=false;}
}
// Use the same center crop for inference and preview, including portrait cameras.
function captureFrame() {
 const source=video.elt,w=source.videoWidth,h=source.videoHeight;
 if(!w||!h||source.readyState<2||cameraBusy) return false;
 const sw=Math.min(w,h*4/3),sh=sw*3/4;
 frameContext.drawImage(source,(w-sw)/2,(h-sh)/2,sw,sh,0,0,640,480);
 return true;
}
function createUI() {
  training = TrainingInput.createController({
    collect: collectSample,
    onStart: () => { if (isTracking) stopTracking(); }
  });
  byId("add-class-btn").addEventListener("click", addClass);
  byId("download-model-btn").addEventListener("click", downloadModel);
  byId("share-model-btn").addEventListener("click", shareModel);
  byId("import-model-btn").addEventListener("click", () => {
    training.stop(); byId("model-file-input").click();
  });
  byId("model-file-input").addEventListener("change", event => importModel(event.target.files[0]));
  const button = (id, label, parent, handler, style = "start-button") => {
    const node = document.createElement("button");
    node.type = "button"; node.id = id; node.className = style; node.textContent = label;
    node.addEventListener("click", handler); byId(parent).appendChild(node);
  };
  button("reset-model-btn", "🗑️ 데이터 초기화", "reset-btn-container", clearAllModel, "reset-button");
  button("connect-btn", "AI 로딩 중...", "bluetooth-control-buttons", connectBluetooth);
  button("disconnect-btn", "연결 해제", "bluetooth-control-buttons", disconnectBluetooth, "stop-button");
  button("start-track-btn", "인식 시작", "recognition-control-buttons", startTracking);
  button("stop-track-btn", "인식 중지", "recognition-control-buttons", () => stopTracking(), "stop-button");
  const suspend = () => {
    training.stop(); stopTracking(); invalidatePose();
  };
  window.addEventListener("blur", suspend);
  window.addEventListener("pagehide", suspend);
  document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); });
  const header = document.querySelector("header");
  const updateHeader = () => document.documentElement.style.setProperty("--header-height", header.getBoundingClientRect().height + "px");
  new ResizeObserver(updateHeader).observe(header);
  updateHeader(); renderClasses(); updateControls();
}
function updateControls() {
  document.querySelectorAll(".train-btn").forEach(button => {
    button.disabled = isBusy || !isModelReady || !poseAvailable;
  });
  document.querySelectorAll(".delete-btn, #add-class-btn, #reset-model-btn, #import-model-btn")
    .forEach(button => { button.disabled = isBusy; });
  byId("download-model-btn").disabled = isBusy || !trainingData.length;
  byId("share-model-btn").disabled = isBusy || !trainingData.length;
  byId("start-track-btn").disabled = isBusy || !isModelReady || !trainingData.length;
  byId("connect-btn").disabled = isConnecting || isConnected;
  byId("connect-btn").textContent = isConnected ? "연결됨" : isConnecting ? "연결 중..." : "기기 연결";
}
async function initMediaPipe() {
  try {
    setText("status-badge", "MediaPipe 로딩 중...");
    const m = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8");
    const vision = await m.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm");
    const options = {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: false
    };
    try { poseLandmarker = await m.PoseLandmarker.createFromOptions(vision, options); }
    catch (_) { options.baseOptions.delegate = "CPU"; poseLandmarker = await m.PoseLandmarker.createFromOptions(vision, options); }
    isModelReady = true;
    setText("status-badge", "전신을 카메라에 비춰주세요");
    updateControls();
    inferenceLoop();
  } catch (error) {
    console.error(error);
    modelLoadFailed = true; isModelReady = false;
    setText("status-badge", "모델 로드 실패");
    trainingStatus("모델을 불러오지 못했습니다. 연결 상태를 확인한 뒤 새로고침해주세요.");
    updateControls();
  }
}
function inferenceLoop() {
  if (isModelReady && video && poseLandmarker && !document.hidden) {
    const input = video.elt;
    if (input.readyState >= 2 && input.currentTime !== lastVideoTime && performance.now()-lastInferenceAt>=100 && captureFrame()) {
      lastVideoTime = input.currentTime; lastInferenceAt=performance.now();
      try {
        const result = poseLandmarker.detectForVideo(frameCanvas, performance.now());
        handlePoseResult(result.landmarks && result.landmarks[0]);
      } catch (error) {
        console.error(error);
        invalidatePose();
      }
    }
  }
  requestAnimationFrame(inferenceLoop);
}
function handlePoseResult(landmarks) {
  const features = PoseModel.extractFeatures(landmarks);
  if (!features) { invalidatePose(); return; }
  frameId++;
  lastLandmarks = landmarks; lastFeatures = features;
  lastPoseSeenAt = performance.now(); poseLossSent = false;
  if (!poseAvailable) {
    poseAvailable = true;
    setText("status-badge", "전신 감지됨");
    updateControls();
  }
  // Classify once per fresh camera result, not once per render of cached landmarks.
  if (isTracking && !isBusy) showPrediction(PoseModel.classify(trainingData, features));
}
function invalidatePose() {
  lastLandmarks = null; lastFeatures = null;
  if (poseAvailable) {
    poseAvailable = false;
    training.stop();
    trainingStatus("전신이 감지되지 않아 수집을 중단했습니다. 전신을 비춘 뒤 다시 눌러주세요.");
    updateControls();
  }
  if (isModelReady) setText("status-badge", "전신을 카메라에 비춰주세요");
}
function checkPoseFreshness() {
  if (poseAvailable && performance.now() - lastPoseSeenAt > POSE_FRESH_MS) invalidatePose();
  if (isTracking && !poseAvailable) {
    setText("result-label", "전신 감지 안 됨");
    setText("result-conf", "전신을 비추면 인식을 다시 시작합니다.");
    if (!poseLossSent && performance.now() - lastPoseSeenAt > POSE_FRESH_MS) {
      poseLossSent = true;
      sendStop(trackingEpoch);
    }
  }
}
function draw() {
  background(0);
  push();
  if (isFlipped) { translate(width, 0); scale(-1, 1); }
  if (video && frameCanvas && video.elt.readyState >= 2) drawingContext.drawImage(frameCanvas,0,0,width,height);
  pop();
  if (training) checkPoseFreshness();
  if (lastLandmarks) drawLandmarks(lastLandmarks);
}
function syncNextClassId() {
  const used = new Set(classIds);
  nextClassId = 1;
  while (used.has("ID" + nextClassId)) nextClassId++;
}
function addClass() {
  if (isBusy) return;
  training.stop();
  syncNextClassId();
  if (classIds.length >= PoseModel.MAX_CLASSES || nextClassId >= Number.MAX_SAFE_INTEGER - 1) {
    trainingStatus("ID는 최대 100개까지 추가할 수 있습니다."); return;
  }
  const id = "ID" + nextClassId++;
  classIds.push(id); renderClasses(); updateControls();
  const row = byId("training-list").querySelector('[data-id="' + id + '"]');
  row.classList.add("new-class");
  trainingStatus(id + "를 추가했습니다. 전신을 비추고 학습해주세요.");
}
function renderClasses() {
  syncNextClassId();
  byId("add-class-btn").textContent = "+ ID" + nextClassId + " 추가";
  classIds.sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  const list = byId("training-list"); list.replaceChildren();
  if (!classIds.length) {
    const empty = document.createElement("div");
    empty.className = "empty-msg"; empty.textContent = "아직 학습 ID가 없습니다.";
    list.appendChild(empty); return;
  }
  const counts = PoseModel.counts(trainingData);
  for (const id of classIds) {
    const row = document.createElement("div"); row.className = "list-item train-btn-row"; row.dataset.id = id;
    const button = document.createElement("button");
    button.type = "button"; button.className = "train-btn"; button.dataset.id = id;
    button.setAttribute("aria-label", id + " 학습: 짧게 누르면 1개, 길게 누르면 연속 수집");
    for (const [name, text] of [["id-badge", id], ["train-text", "학습하기"], ["badge-count train-count", (counts[id] || 0) + "개"]]) {
      const span = document.createElement("span"); span.className = name; span.textContent = text;
      button.appendChild(span);
    }
    training.bind(button, id);
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "delete-btn delete-class-btn"; remove.textContent = "×";
    remove.setAttribute("aria-label", id + " 삭제");
    remove.addEventListener("click", () => deleteClass(id));
    row.append(button, remove); list.appendChild(row);
  }
}
function collectSample(id) {
  if (isBusy || !isModelReady || !classIds.includes(id)) return false;
  if (!poseAvailable || !lastFeatures || performance.now() - lastPoseSeenAt > POSE_FRESH_MS) {
    trainingStatus("전신을 카메라에 비춘 뒤 다시 눌러주세요."); return false;
  }
  if (isTracking) stopTracking();
  if (lastSampleFrame === frameId) return null;
  const count = PoseModel.counts(trainingData)[id] || 0;
  if (count >= PoseModel.MAX_PER_CLASS || trainingData.length >= PoseModel.MAX_SAMPLES) {
    trainingStatus("ID당 500개, 전체 2,000개까지 학습할 수 있습니다."); return false;
  }
  trainingData.push({label: id, features: [...lastFeatures]});
  lastSampleFrame = frameId;
  const badge = document.querySelector('.train-btn[data-id="' + id + '"] .badge-count');
  if (badge) badge.textContent = (count + 1) + "개";
  trainingStatus(id + " · " + (count + 1) + "개 수집됨");
  updateControls();
  return true;
}
function stopForChange() {
  training.stop(); stopTracking();
}
function deleteClass(id) {
  if (isBusy) return;
  training.stop();
  if (!confirm(id + "와 해당 학습 데이터를 삭제할까요?")) return;
  stopForChange();
  trainingData = trainingData.filter(sample => sample.label !== id);
  classIds = classIds.filter(label => label !== id);
  syncNextClassId();
  if (!classIds.length) {
    lastSampleFrame = -1;
  }
  renderClasses(); updateControls();
  setText("result-label", "대기 중"); setText("result-conf", "데이터 변경됨");
  trainingStatus(classIds.length
    ? id + "를 삭제했습니다. 다른 ID는 유지됩니다."
    : "모든 ID를 삭제했습니다. ID1부터 추가할 수 있습니다.");
}
function clearAllModel() {
  if (isBusy) return;
  training.stop();
  if (!confirm("모든 ID와 학습 데이터를 초기화할까요?")) return;
  stopForChange();
  trainingData = []; classIds = []; nextClassId = 1; lastSampleFrame = -1;
  renderClasses(); updateControls();
  setText("result-label", "대기 중"); setText("result-conf", "데이터 없음");
  trainingStatus("초기화했습니다. ID1부터 추가할 수 있습니다.");
  fileStatus("학습한 뒤 모델을 다운로드하거나 공유하세요.");
}
function makeModelFile() {
  training.stop();
  // Keep the version-1 file compatible with older apps; allocation is recalculated on import.
  const exportNextId = Math.max(0, ...classIds.map(id => Number(id.slice(2)))) + 1;
  const project = PoseModel.serialize(classIds, exportNextId, trainingData, isFlipped);
  const file = new File([JSON.stringify(project)], "boundary-x-bodypose-" +
    new Date().toISOString().replace(/[:.]/g, "-") + ".json", {type: "application/json"});
  if (file.size > PoseModel.MAX_BYTES) throw new Error("파일이 8MiB를 초과합니다. 학습 데이터를 줄여주세요.");
  return file;
}
function downloadFile(file) {
  const url = URL.createObjectURL(file), link = document.createElement("a");
  link.href = url; link.download = file.name; link.hidden = true;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function downloadModel() {
  if (isBusy) return;
  try { downloadFile(makeModelFile()); fileStatus("JSON 다운로드를 요청했습니다. 브라우저의 다운로드 또는 파일 앱을 확인해주세요."); }
  catch (error) { fileStatus(error.message); }
}
async function shareModel() {
  if (isBusy) return;
  try {
    const file = makeModelFile();
    if (!navigator.share || !navigator.canShare || !navigator.canShare({files: [file]})) {
      downloadFile(file);
      fileStatus("JSON 파일 공유를 지원하지 않아 다운로드했습니다. 파일을 메일 등에 첨부해주세요.");
      return;
    }
    isBusy = true; updateControls();
    await navigator.share({files: [file], title: "Boundary X 몸 포즈 모델"});
    fileStatus("공유 앱에 파일을 전달했습니다. 최종 전송은 선택한 앱에서 확인해주세요.");
  } catch (error) {
    fileStatus(error.name === "AbortError" ? "공유를 취소했습니다."
      : "파일 공유에 실패했습니다. 모델 다운로드로 저장한 뒤 첨부해주세요.");
  } finally { isBusy = false; updateControls(); }
}
async function importModel(file) {
  if (!file || isBusy) return;
  isBusy = true; training.stop(); updateControls();
  try {
    if (file.size > PoseModel.MAX_BYTES) throw new Error("8MiB 이하의 JSON 파일을 선택해주세요.");
    const project = PoseModel.parse(await file.text());
    // Prepare independent state before touching the current project.
    const samples = project.samples.map(sample => ({label: sample.label, features: [...sample.features]}));
    const ids = [...project.classIds];
    if (classIds.length && !confirm("가져오면 현재 ID와 학습 데이터를 교체합니다. 계속할까요?")) {
      fileStatus("가져오기를 취소했습니다. 기존 데이터는 유지됩니다."); return;
    }
    stopForChange();
    trainingData = samples; classIds = ids; nextClassId = project.nextClassId;
    syncNextClassId();
    isFlipped = project.settings.isFlipped; byId("mirror-camera").setAttribute("aria-pressed",String(isFlipped)); lastSampleFrame = -1;
    renderClasses();
    setText("result-label", "모델 준비됨"); setText("result-conf", "인식 시작을 눌러주세요.");
    trainingStatus("모델을 가져왔습니다. 전신을 비추고 ID별 학습을 이어갈 수 있습니다.");
    fileStatus(classIds.length + "개 ID · " + trainingData.length + "개 샘플을 가져왔습니다.");
  } catch (error) {
    fileStatus("가져오기 실패: " + error.message);
  } finally {
    byId("model-file-input").value = "";
    isBusy = false; updateControls();
  }
}
function startTracking() {
  if (isBusy || isTracking || !isModelReady || !trainingData.length) return;
  training.stop();
  trackingEpoch++; isTracking = true; poseLossSent = false;
  lastSentLabel = ""; lastSendTime = 0;
  setText("result-label", "전신 감지 대기"); setText("result-conf", "");
}
function stopTracking(sendStopSignal = true) {
  const active = isTracking;
  isTracking = false;
  if (active) trackingEpoch++;
  if (active) {
    setText("result-label", "중지됨"); setText("result-conf", "");
    if (sendStopSignal) sendStop(trackingEpoch);
  }
}
function showPrediction(result) {
  if (!result || !isTracking) return;
  setText("result-label", result.label);
  setText("result-conf", "KNN 투표 비율: " + (result.confidence * 100).toFixed(0) + "%" +
    (result.neighbors < 5 ? " · 샘플 부족 (" + result.neighbors + "/5)" : ""));
  if (!isConnected) { setText("bluetooth-data-display", "전송 대기: 기기 연결 필요"); return; }
  if (!predictionSendPending &&
      (result.label !== lastSentLabel || Date.now() - lastSendTime > SEND_INTERVAL)) {
    predictionSendPending = true;
    queueSend(result.label, trackingEpoch).finally(() => { predictionSendPending = false; });
  }
}
function sendStop(epoch) {
  return queueSend("stop", epoch, 5);
}
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("BLE write timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function queueSend(data, epoch, attempts = 1) {
  const target = rxCharacteristic, device = bluetoothDevice;
  const operation = sendQueue.then(async () => {
    if (data !== "stop" && (epoch !== trackingEpoch || !isTracking || !poseAvailable || performance.now()-lastPoseSeenAt>POSE_FRESH_MS)) return false;
    if (!isConnected || !target || target !== rxCharacteristic) {
      if (epoch === trackingEpoch) setText("bluetooth-data-display", "전송 대기: 기기 연결 필요");
      return false;
    }
    for (let i = 0; i < attempts; i++) {
      if (!isConnected || target !== rxCharacteristic) return false;
      try {
        await withTimeout(target.writeValue(new TextEncoder().encode(data + "\n")), 2000);
        if (epoch === trackingEpoch) {
          lastSentLabel = data; lastSendTime = Date.now();
          setText("bluetooth-data-display", "전송됨: " + data);
        }
        return true;
      } catch (error) {
        if (error.message === "BLE write timeout") {
          // A timeout does not cancel the underlying write. Disconnect before allowing another.
          if (device && device.gatt.connected) device.gatt.disconnect();
          isConnected = false; rxCharacteristic = null;
          stopTracking(false);
          bluetoothStatus = "전송 시간 초과. 다시 연결해주세요."; updateBluetoothStatusUI(); updateControls();
          setText("bluetooth-data-display", "전송 실패: 다시 연결해주세요.");
          return false;
        }
        if (i + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 80));
      }
    }
    if (epoch === trackingEpoch) {
      setText("bluetooth-data-display", data === "stop" ? "정지 신호 전송 실패: 연결을 확인해주세요." : "전송 실패: 연결을 확인해주세요.");
    }
    return false;
  });
  sendQueue = operation.catch(() => false);
  return sendQueue;
}
async function connectBluetooth() {
  if (isConnecting || isConnected) return;
  isConnecting = true; updateControls();
  try {
    if (!navigator.bluetooth) throw new Error("이 브라우저는 블루투스를 지원하지 않습니다.");
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{namePrefix: "BBC micro:bit"}], optionalServices: [UART_SERVICE_UUID]
    });
    bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);
    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(UART_RX_UUID);
    isConnected = true; lastSentLabel = ""; lastSendTime = 0;
    bluetoothStatus = "연결됨: " + bluetoothDevice.name;
  } catch (error) {
    bluetoothStatus = "연결 실패: " + error.message;
  } finally { isConnecting = false; updateBluetoothStatusUI(); updateControls(); }
}
function disconnectBluetooth() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    isManualDisconnect = true; bluetoothDevice.gatt.disconnect();
  } else onDisconnected();
}
function onDisconnected(event) {
  if (event && event.target !== bluetoothDevice) return;
  isConnected = false; rxCharacteristic = null; bluetoothDevice = null;
  const wasTracking = isTracking;
  stopTracking(false);
  bluetoothStatus = isManualDisconnect ? "연결 해제됨" : "연결이 끊어졌습니다. 다시 연결해주세요.";
  isManualDisconnect = false;
  updateBluetoothStatusUI(); updateControls();
  setText("bluetooth-data-display", wasTracking ? "연결 해제로 인식이 중지되었습니다." : "전송 대기: 기기 연결 필요");
}
function updateBluetoothStatusUI() {
  setText("bluetoothStatus", "상태: " + bluetoothStatus);
  byId("bluetoothStatus").classList.toggle("status-connected", isConnected);
}
function drawLandmarks(landmarks) {
  const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  stroke(0, 200, 0); strokeWeight(2);
  for (const [a, b] of connections) {
    let ax = landmarks[a].x * width, ay = landmarks[a].y * height;
    let bx = landmarks[b].x * width, by = landmarks[b].y * height;
    if (isFlipped) { ax = width - ax; bx = width - bx; }
    line(ax, ay, bx, by);
  }
  noStroke();
  for (const i of PoseModel.JOINTS) {
    let x = landmarks[i].x * width;
    let y = landmarks[i].y * height;
    if (isFlipped) x = width - x;
    fill(i === 0 ? color(255, 0, 0) : color(0, 255, 0));
    ellipse(x, y, 7, 7);
  }
}
