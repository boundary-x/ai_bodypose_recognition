/* Boundary X — MediaPipe Lite + landmark KNN local prototype. */
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const SEND_INTERVAL = 100;
const POSE_FRESH_MS = 500;
let video, poseExtractor;
let classifier=null, classifierWeights=null, trainingCandidate=null, cancelTraining=false;
let frameReady=false, lastFrameSeenAt=-Infinity, runtimeEpoch=0, inferenceBusy=false;
let isModelReady = false, modelLoadFailed = false;
let lastLandmarks = null, lastFeatures = null, lastVideoTime = -1;
let frameId = 0, lastSampleFrame = -1, lastPoseSeenAt = -Infinity;
let poseAvailable = false, poseLossSent = false;
let trainingData = [], classIds = [], nextClassId = 1;
let isTracking = false, isBusy = false, isFlipped = true;
let badgePrediction = null;
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
const faceSurprise=FaceSurprise.create();
function currentFaceGeometry(){
  if(!frameReady||performance.now()-lastFrameSeenAt>POSE_FRESH_MS)return null;
  return FaceSurprise.geometry(lastLandmarks,width,height,isFlipped);
}
function setup() {
  const preview=createCanvas(640,480);preview.parent('p5-container');
  preview.elt.addEventListener('click',event=>{
    const rect=preview.elt.getBoundingClientRect();if(!rect.width||!rect.height)return;
    faceSurprise.tap(currentFaceGeometry(),(event.clientX-rect.left)*width/rect.width,(event.clientY-rect.top)*height/rect.height);
  });
  preview.elt.style.touchAction='manipulation';
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
  startCamera(); initPoseNet();
}
async function startCamera() {
  if(cameraBusy || isBusy) return;
  cameraBusy=true; byId('switch-camera').disabled=true;
  stopForChange(); runtimeEpoch++; invalidatePose(); lastVideoTime=-1;
  if(video.elt.srcObject) video.elt.srcObject.getTracks().forEach(t=>t.stop());
  video.elt.srcObject=null;
  setText('camera-status','카메라 연결 중…');
  try {
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:640},height:{ideal:480}}});
    video.elt.srcObject=stream; await video.elt.play();
    stream.getVideoTracks()[0].addEventListener('ended',()=>{stopForChange();invalidatePose();setText('camera-status','카메라 연결이 끊겼습니다. 다시 시도해주세요.');byId('retry-camera').hidden=false;});
    setText('camera-status','학습할 자세를 비춰주세요. 상체만 보이거나 일부 관절이 가려져도 수집할 수 있습니다.');
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
    onStart: () => { if (isTracking) stopTracking(); },
    onChange: renderCapture
  });
  byId("capture-cancel").onclick=()=>training.stop();

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
    training.stop('background'); stopTracking(); runtimeEpoch++; invalidatePose(); cancelModelTraining();
  };
  // A screenshot tool or another visible window should not cancel collection.
  // Stop robot output on focus loss, but cancel collection only when hidden.
  window.addEventListener("blur", () => stopTracking());
  window.addEventListener("pagehide", suspend);
  document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); });
  const header = document.querySelector("header");
  const updateHeader = () => document.documentElement.style.setProperty("--header-height", header.getBoundingClientRect().height + "px");
  new ResizeObserver(updateHeader).observe(header);
  updateHeader(); renderClasses(); updateControls();
}
function updateCameraBadge() {
  let message;
  if(modelLoadFailed)message="모델 로드 실패";
  else if(!isModelReady)message="포즈 모델 로딩 중…";
  else if(training?.active)message=training.state.id+" · "+(training.state.phase==='countdown'?"자세 준비 중":"샘플 수집 중");
  else if(!frameReady)message="카메라 영상을 기다리는 중…";
  else if(isTracking){
    if(!poseAvailable||performance.now()-lastPoseSeenAt>POSE_FRESH_MS)message="사람이 감지되지 않습니다";
    else if(badgePrediction)message=badgePrediction.label+" · "+Math.round(badgePrediction.confidence*100)+"%";
    else message="일치하는 자세 확인 중…";
  }
  else if(classifier)message="인식 준비 완료 · 시작을 눌러주세요";
  else message=poseAvailable?"자세 감지됨 · 샘플 수집 가능":"얼굴과 양쪽 어깨가 보이도록 자세를 비춰주세요";
  if(byId("status-badge").textContent!==message)setText("status-badge",message);
}
function updateControls() {
  updateCameraBadge();
  document.querySelectorAll('.train-btn').forEach(button=>{button.disabled=isBusy||!isModelReady||!frameReady||training?.active||(PoseModel.counts(trainingData)[button.dataset.id]||0)>90||trainingData.length>490;});
  document.querySelectorAll('.delete-btn,#add-class-btn,#reset-model-btn,#import-model-btn').forEach(button=>{button.disabled=isBusy||training?.active;});
  byId('download-model-btn').disabled=isBusy||!trainingData.length||training?.active;
  byId('share-model-btn').disabled=isBusy||!trainingData.length||training?.active;
  byId('start-track-btn').disabled=isBusy||!isModelReady||!classifier||training?.active;

  byId('switch-camera').disabled=isBusy||cameraBusy||training?.active;
  byId('connect-btn').disabled=isConnecting||isConnected;
  byId('connect-btn').textContent=isConnected?'연결됨':isConnecting?'연결 중...':'기기 연결';
}
async function initPoseNet() {
 try {setText('status-badge','포즈 모델 로딩 중…');poseExtractor=await loadPoseLandmarker();isModelReady=true;updateControls();inferenceLoop();}
 catch(error){console.error(error);modelLoadFailed=true;trainingStatus('포즈 모델을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해주세요.');updateControls();}
}
async function inferenceLoop() {
  if(isModelReady&&video&&!isBusy&&!cameraBusy&&!document.hidden) {
    const input=video.elt;
    if(input.readyState>=2&&input.currentTime!==lastVideoTime&&performance.now()-lastInferenceAt>=100&&captureFrame()) {
      lastVideoTime=input.currentTime;lastInferenceAt=performance.now();
      const epoch=runtimeEpoch;inferenceBusy=true;
      try {
        const result=poseExtractor.detectForVideo(frameCanvas,performance.now());
        if(epoch===runtimeEpoch&&!isBusy&&!document.hidden)await handlePoseResult(result);
      }catch(error){console.error(error);invalidatePose();}
      finally{inferenceBusy=false;}
    }
  }
  requestAnimationFrame(inferenceLoop);
}
async function handlePoseResult(result) {
 frameId++;lastFrameSeenAt=performance.now();frameReady=true;
 lastLandmarks=result.landmarks?.[0]||null;lastFeatures=PoseModel.extract(lastLandmarks);poseAvailable=!!lastFeatures;
 if(poseAvailable){lastPoseSeenAt=performance.now();poseLossSent=false;}
 if(!poseAvailable)badgePrediction=null;
 updateControls();
 if(isTracking&&!isBusy&&poseAvailable&&classifier){
   const best=PoseModel.predict(lastFeatures,trainingData);
   if(best)showPrediction(best);
   else{badgePrediction=null;setText('result-label','일치하는 자세 없음');setText('result-conf','학습한 자세를 비춰주세요.');updateCameraBadge();if(lastSentLabel!=='stop')sendStop(trackingEpoch);}
 }
}
function invalidatePose() {
  lastLandmarks=null;lastFeatures=null;frameReady=false;poseAvailable=false;badgePrediction=null;
  // Keep batch alive while frames are temporarily unavailable.
  if(isModelReady)setText('status-badge','카메라의 새 영상을 기다리는 중…');
  updateControls();
}
function checkPoseFreshness() {
  if(frameReady&&performance.now()-lastFrameSeenAt>POSE_FRESH_MS)invalidatePose();
  if(isTracking&&(!poseAvailable||performance.now()-lastPoseSeenAt>POSE_FRESH_MS)) {
    badgePrediction=null;updateCameraBadge();
    setText('result-label','자세 감지 안 됨');setText('result-conf','자세를 비추면 인식을 다시 시작합니다.');
    if(!poseLossSent&&performance.now()-lastPoseSeenAt>POSE_FRESH_MS){poseLossSent=true;sendStop(trackingEpoch);}
  }
}
function invalidateClassifier(){
 stopTracking();classifier=Object.values(PoseModel.counts(trainingData)).some(n=>n>=10)?true:null;
 setText('model-status',classifier?'샘플 준비 완료 · 별도 모델 학습 없이 인식을 시작할 수 있습니다.':'ID에 샘플 10개를 모으면 바로 인식할 수 있습니다.');
}
function cancelModelTraining(){}
let captureHideTimer=null;
function renderCapture(state){
 clearTimeout(captureHideTimer);
 const active=['countdown','collecting','paused'].includes(state.phase),overlay=byId('capture-overlay');
 overlay.hidden=!active&&state.phase==='idle';overlay.dataset.phase=state.phase;
 byId('capture-cancel').hidden=!active;
 setText('capture-id',(state.id||'')+' 포즈 학습');
 const message=state.phase==='countdown'?'카메라에서 자세를 잡아주세요':state.phase==='paused'?'얼굴과 양쪽 어깨가 보이도록 해주세요 · 자동으로 이어집니다':state.phase==='done'?'10개 수집 완료! 다른 자세도 추가해보세요':state.phase==='timeout'?'수집 시간이 지났습니다. 자세를 확인한 뒤 다시 눌러주세요.':state.phase==='limit'?'저장할 수 있는 샘플 수에 도달했습니다.':state.phase==='background'?'화면을 벗어나 수집을 중단했습니다. 모은 샘플은 유지됩니다.':state.phase==='cancelled'?'수집을 취소했습니다. 모은 샘플은 유지됩니다.':'자세를 유지해주세요';
 setText('capture-number',state.phase==='countdown'?state.seconds:state.count+' / 10');
 setText('capture-message',message);setText('capture-caption',state.phase==='countdown'?'초 후 자동 수집':state.phase==='done'?'수집 완료':state.phase==='paused'?'자세 확인 중':'샘플');
 byId('capture-progress').value=state.count;
 trainingStatus((state.id||'')+' · '+message);updateControls();
 if(!active){invalidateClassifier();updateControls();captureHideTimer=setTimeout(()=>{if(!training.active)overlay.hidden=true;},5000);}
}

function draw() {
  background(0);
  push();
  if (isFlipped) { translate(width, 0); scale(-1, 1); }
  if (video && frameCanvas && video.elt.readyState >= 2) {
    if (!inferenceBusy) captureFrame();
    drawingContext.drawImage(frameCanvas,0,0,width,height);
  }
  pop();
  if (training) checkPoseFreshness();
  if (lastLandmarks) drawLandmarks(lastLandmarks);
  faceSurprise.draw(drawingContext,currentFaceGeometry());
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
    trainingStatus("ID는 최대 20개까지 추가할 수 있습니다."); return;
  }
  const id = "ID" + nextClassId++;
  invalidateClassifier(); classIds.push(id); renderClasses(); updateControls();
  const row = byId("training-list").querySelector('[data-id="' + id + '"]');
  row.classList.add("new-class");
  trainingStatus(id + "를 추가했습니다. 자세를 비추고 학습해주세요.");
}
function renderClasses() {
  syncNextClassId();
  byId("add-class-btn").textContent = "+ ID" + nextClassId + " 추가";
  const sortedIds=[...classIds].sort((a,b)=>Number(a.slice(2))-Number(b.slice(2)));
  const list = byId("training-list"); list.replaceChildren();
  if (!classIds.length) {
    const empty = document.createElement("div");
    empty.className = "empty-msg"; empty.textContent = "아직 학습 ID가 없습니다.";
    list.appendChild(empty); return;
  }
  const counts = PoseModel.counts(trainingData);
  for (const id of sortedIds) {
    const row = document.createElement("div"); row.className = "list-item train-btn-row"; row.dataset.id = id;
    const button = document.createElement("button");
    button.type = "button"; button.className = "train-btn"; button.dataset.id = id;
    button.setAttribute("aria-label", id + " 학습하기: 5초 후 샘플 10개 자동 수집");
    for (const [name, text] of [["id-badge", id], ["train-text", "학습하기 · 10개"], ["badge-count train-count", (counts[id] || 0) + "개"]]) {
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
  if (!frameReady || !poseAvailable || !lastFeatures || performance.now() - lastFrameSeenAt > POSE_FRESH_MS) {
    return false;
  }
  if (isTracking) stopTracking();
  if (lastSampleFrame === frameId) return null;
  const count = PoseModel.counts(trainingData)[id] || 0;
  if (count >= PoseModel.MAX_PER_CLASS || trainingData.length >= PoseModel.MAX_SAMPLES) {
    trainingStatus("ID당 100개, 전체 500개까지 수집할 수 있습니다."); return "limit";
  }
  trainingData.push({label: id, features: new Float32Array(lastFeatures)});
  lastSampleFrame = frameId;
  invalidateClassifier();
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
  invalidateClassifier();
  trainingData = trainingData.filter(sample => sample.label !== id);
  classIds = classIds.filter(label => label !== id);
  invalidateClassifier();
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
  invalidateClassifier();
  trainingData = []; classIds = []; nextClassId = 1; lastSampleFrame = -1;invalidateClassifier();
  renderClasses(); updateControls();
  setText("result-label", "대기 중"); setText("result-conf", "데이터 없음");
  trainingStatus("초기화했습니다. ID1부터 추가할 수 있습니다.");
  fileStatus("학습한 뒤 모델을 다운로드하거나 공유하세요.");
}
function makeModelFile() {
  training.stop();
  const project = PoseModel.serialize(classIds, trainingData, isFlipped, classifierWeights);
  const file = new File([JSON.stringify(project)], "boundary-x-bodypose-" +
    new Date().toISOString().replace(/[:.]/g, "-") + ".json", {type: "application/json"});
  if (file.size > PoseModel.MAX_BYTES) throw new Error("파일이 64MiB를 초과합니다. 학습 데이터를 줄여주세요.");
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
async function importModel(file){
 if(!file||isBusy)return;training.stop();stopTracking();isBusy=true;updateControls();
 try{
   if(file.size>PoseModel.MAX_BYTES)throw Error('4MiB 이하의 파일을 선택해주세요.');
   const project=PoseModel.parse(await file.text());
   if(classIds.length&&!confirm('현재 ID와 샘플을 가져온 데이터로 교체할까요?'))return;
   trainingData=project.samples;classIds=project.classIds;isFlipped=project.settings.isFlipped;lastSampleFrame=-1;
   byId('mirror-camera').setAttribute('aria-pressed',String(isFlipped));invalidateClassifier();renderClasses();fileStatus(classIds.length+'개 ID · '+trainingData.length+'개 샘플 가져오기 완료');
 }catch(error){fileStatus('가져오기 실패: '+error.message);}finally{isBusy=false;byId('model-file-input').value='';updateControls();}
}
function startTracking() {
  if (isBusy || isTracking || !isModelReady || !classifier) return;
  training.stop();
  trackingEpoch++; isTracking = true; poseLossSent = false;badgePrediction=null;updateCameraBadge();
  lastSentLabel = ""; lastSendTime = 0;
  setText("result-label", "자세 감지 대기"); setText("result-conf", "");
}
function stopTracking(sendStopSignal = true) {
  const active = isTracking;
  isTracking = false;badgePrediction=null;updateCameraBadge();
  if (active) trackingEpoch++;
  if (active) {
    setText("result-label", "중지됨"); setText("result-conf", "");
    if (sendStopSignal) sendStop(trackingEpoch);
  }
}
function showPrediction(result) {
  if (!result || !isTracking) return;
  badgePrediction={label:result.label,confidence:result.confidence};updateCameraBadge();
  setText("result-label", result.label);
  setText("result-conf", "이웃 샘플 일치 비율: " + (result.confidence * 100).toFixed(0) + "%");
  if (!isConnected) { setText("bluetooth-data-display", "전송할 데이터: " + result.label); return; }
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
      if (epoch === trackingEpoch) setText("bluetooth-data-display", "전송할 데이터: " + data);
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
    bluetoothDevice = await BoardLink.requestDevice({
      filters: [{namePrefix: "BBC micro:bit"}], optionalServices: [UART_SERVICE_UUID]
    });
    bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);
    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    rxCharacteristic = await BoardLink.getCharacteristic(service,UART_RX_UUID);
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
function drawLandmarks(points) {
  const edges=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  points=points.map(p=>({score:p.visibility,position:{x:p.x*width,y:p.y*height}}));
  const visible=p=>p&&p.score>=0.3&&Number.isFinite(p.position.x)&&Number.isFinite(p.position.y);
  const x=p=>isFlipped?width-p.position.x:p.position.x;
  push();
  // Two-pass strokes remain visible on both light walls and dark clothing.
  // Canvas coordinates, mirrored position and detection thresholds are unchanged.
  for(const [color,weight] of [[[12,20,28,230],9],[[65,255,178,255],5]]){
    stroke(...color);strokeWeight(weight);
    for(const [a,b]of edges)if(visible(points[a])&&visible(points[b]))line(x(points[a]),points[a].position.y,x(points[b]),points[b].position.y);
  }
  for(let i=0;i<points.length;i++){
    const p=points[i];if(!visible(p))continue;
    const wrist=i===15||i===16,body=i>=11;
    const size=wrist?17:body?13:8;
    stroke(12,20,28,240);strokeWeight(body?3:2);
    if(wrist)fill(255,211,77);else fill(90,255,191);
    ellipse(x(p),p.position.y,size,size);
  }
  pop();
}











