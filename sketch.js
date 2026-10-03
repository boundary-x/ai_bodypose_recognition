/* Boundary X — official Teachable Machine PoseNet features + neural classifier. */
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
    onStart: () => { if (isTracking) stopTracking(); }
  });
  byId("train-model-btn").addEventListener("click", trainModel);
  byId("cancel-training-btn").addEventListener("click", cancelModelTraining);
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
    training.stop(); stopTracking(); runtimeEpoch++; invalidatePose(); cancelModelTraining();
  };
  window.addEventListener("blur", suspend);
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
  else if(!isModelReady)message="PoseNet 로딩 중…";
  else if(trainingCandidate)message=cancelTraining?"모델 학습 취소 중…":"모델 학습 중…";
  else if(!frameReady)message="카메라 영상을 기다리는 중…";
  else if(isTracking){
    if(!poseAvailable||performance.now()-lastPoseSeenAt>POSE_FRESH_MS)message="사람이 감지되지 않습니다";
    else if(badgePrediction)message=badgePrediction.label+" · "+Math.round(badgePrediction.confidence*100)+"%";
    else message="자세 인식 중…";
  }
  else if(classifier)message="인식 준비 완료 · 시작을 눌러주세요";
  else message=poseAvailable?"자세 감지됨 · 샘플 수집 가능":"자세 미감지 · 샘플 수집 가능";
  if(byId("status-badge").textContent!==message)setText("status-badge",message);
}
function updateControls() {
  updateCameraBadge();
  document.querySelectorAll('.train-btn').forEach(button=>{button.disabled=isBusy||!isModelReady||!frameReady;});
  document.querySelectorAll('.delete-btn,#add-class-btn,#reset-model-btn,#import-model-btn').forEach(button=>{button.disabled=isBusy;});
  byId('download-model-btn').disabled=isBusy||!trainingData.length;
  byId('share-model-btn').disabled=isBusy||!trainingData.length;
  byId('start-track-btn').disabled=isBusy||!isModelReady||!classifier;
  byId('train-model-btn').disabled=isBusy||!isModelReady||!PoseModel.trainable(classIds,trainingData);
  byId('cancel-training-btn').hidden=!trainingCandidate;
  byId('switch-camera').disabled=isBusy||cameraBusy;
  byId('connect-btn').disabled=isConnecting||isConnected;
  byId('connect-btn').textContent=isConnected?'연결됨':isConnecting?'연결 중...':'기기 연결';
}
async function initPoseNet() {
  try {
    setText('status-badge','PoseNet 로딩 중…');
    if(typeof tf==='undefined'||typeof tmPose==='undefined')throw new Error('AI 라이브러리를 다운로드하지 못했습니다.');
    await tf.ready();
    poseExtractor=await tmPose.createTeachable({labels:[],modelSettings:PoseModel.SETTINGS});
    isModelReady=true; setText('status-badge','학습할 자세를 비춰주세요'); updateControls(); inferenceLoop();
  } catch(error){
    console.error(error); modelLoadFailed=true; isModelReady=false;
    setText('status-badge','모델 로드 실패'); trainingStatus('모델 로드 실패: '+error.message+' 인터넷 연결을 확인하고 새로고침해주세요.');updateControls();
  }
}
async function inferenceLoop() {
  if(isModelReady&&video&&!isBusy&&!cameraBusy&&!document.hidden) {
    const input=video.elt;
    if(input.readyState>=2&&input.currentTime!==lastVideoTime&&performance.now()-lastInferenceAt>=100&&captureFrame()) {
      lastVideoTime=input.currentTime;lastInferenceAt=performance.now();
      const epoch=runtimeEpoch;inferenceBusy=true;
      try {
        const result=await poseExtractor.estimatePose(frameCanvas);
        if(epoch===runtimeEpoch&&!isBusy&&!document.hidden)await handlePoseResult(result);
      }catch(error){console.error(error);invalidatePose();}
      finally{inferenceBusy=false;}
    }
  }
  requestAnimationFrame(inferenceLoop);
}
async function handlePoseResult(result) {
  const features=result?.posenetOutput;
  if(!PoseModel.validFeatures(features)){invalidatePose();return;}
  frameId++;lastFeatures=features;lastFrameSeenAt=performance.now();frameReady=true;
  lastLandmarks=result.pose?.keypoints||null;
  poseAvailable=PoseModel.hasPerson(result.pose);
  if(poseAvailable){lastPoseSeenAt=performance.now();poseLossSent=false;}
  if(!poseAvailable)badgePrediction=null;
  updateControls();
  if(isTracking&&!isBusy&&poseAvailable&&classifier) {
    const epoch=trackingEpoch,current=classifier;
    const probabilities=await current.predict(features);
    if(epoch!==trackingEpoch||current!==classifier||!isTracking||performance.now()-lastPoseSeenAt>POSE_FRESH_MS)return;
    const best=probabilities.reduce((a,b)=>a.probability>=b.probability?a:b);
    if(!Number.isFinite(best.probability))throw new Error('분류 결과가 유효하지 않습니다. 모델을 다시 학습해주세요.');
    showPrediction({label:best.className,confidence:best.probability});
  }
}
function invalidatePose() {
  lastLandmarks=null;lastFeatures=null;frameReady=false;poseAvailable=false;badgePrediction=null;
  if(training)training.stop();
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
function invalidateClassifier() {
  stopTracking();
  PoseClassifier.dispose(classifier);classifier=null;classifierWeights=null;
  setText('model-status','샘플을 모은 뒤 모델 학습을 눌러주세요. ID나 샘플을 변경하면 다시 학습해야 합니다.');
  byId('model-progress').value=0;
}
function cancelModelTraining(){if(trainingCandidate){cancelTraining=true;trainingCandidate.model.stopTraining=true;setText('model-status','학습을 취소하는 중…');}}
async function trainModel() {
  if(isBusy||!isModelReady||!PoseModel.trainable(classIds,trainingData))return;
  stopForChange();runtimeEpoch++;isBusy=true;cancelTraining=false;updateControls();
  let candidate=null;
  try {
    while(inferenceBusy)await new Promise(resolve=>setTimeout(resolve,20));
    candidate=PoseClassifier.create(poseExtractor,classIds);trainingCandidate=candidate;candidate.setLabels([...classIds]);
    for(const sample of trainingData)await candidate.addExample(classIds.indexOf(sample.label),sample.features);
    // The official trainer replaces its initial empty Sequential model.
    candidate.model.dispose();
    byId('model-progress').value=0;updateControls();setText('model-status','모델 학습 중… 화면을 열어두세요.');
    await candidate.train({denseUnits:100,epochs:30,learningRate:0.0001,batchSize:16},{
      onBatchEnd:async()=>{if(cancelTraining)candidate.model.stopTraining=true;await tf.nextFrame();},
      onEpochEnd:async(epoch)=>{byId('model-progress').value=epoch+1;setText('model-status','모델 학습 중 · '+(epoch+1)+' / 30');if(cancelTraining)candidate.model.stopTraining=true;await tf.nextFrame();}
    });
    if(cancelTraining){setText('model-status','학습을 취소했습니다. 수집한 샘플은 유지됩니다.');return;}
    const weights=await PoseClassifier.pack(candidate);
    if(cancelTraining){setText('model-status','학습을 취소했습니다. 수집한 샘플은 유지됩니다.');return;}
    // Materialize an inference-only model from the exact weights used by export/import.
    // The training graph and its optimizer/backend caches are never reused for live inference.
    const inferenceModel=PoseClassifier.restore(poseExtractor,classIds,PoseModel.decodeFloats(weights,PoseModel.weightCount(classIds.length)));
    PoseClassifier.dispose(classifier);classifier=inferenceModel;classifierWeights=weights;
    setText('model-status','학습 완료 · 인식 시작을 눌러주세요.');
    setText('result-label','모델 준비됨');setText('result-conf','인식 시작을 눌러주세요.');
  }catch(error){console.error(error);setText('model-status','학습 실패: '+error.message+' 샘플은 유지됩니다. 다시 시도해주세요.');}
  finally{PoseClassifier.dispose(candidate);trainingCandidate=null;isBusy=false;lastVideoTime=-1;updateControls();}
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
    button.setAttribute("aria-label", id + " 학습: 짧게 누르면 1개, 길게 누르면 연속 수집");
    for (const [name, text] of [["id-badge", id], ["train-text", "샘플 수집"], ["badge-count train-count", (counts[id] || 0) + "개"]]) {
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
  if (!frameReady || !lastFeatures || performance.now() - lastFrameSeenAt > POSE_FRESH_MS) {
    trainingStatus("자세를 카메라에 비춘 뒤 다시 눌러주세요."); return false;
  }
  if (isTracking) stopTracking();
  if (lastSampleFrame === frameId) return null;
  const count = PoseModel.counts(trainingData)[id] || 0;
  if (count >= PoseModel.MAX_PER_CLASS || trainingData.length >= PoseModel.MAX_SAMPLES) {
    trainingStatus("ID당 100개, 전체 500개까지 수집할 수 있습니다."); return false;
  }
  invalidateClassifier();
  trainingData.push({label: id, features: new Float32Array(lastFeatures)});
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
  invalidateClassifier();
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
  invalidateClassifier();
  trainingData = []; classIds = []; nextClassId = 1; lastSampleFrame = -1;
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
async function importModel(file) {
  if(!file||isBusy)return;
  isBusy=true;stopForChange();runtimeEpoch++;updateControls();let restored=null;
  try {
    if(file.size>PoseModel.MAX_BYTES)throw new Error('64MiB 이하의 JSON 파일을 선택해주세요.');
    const project=PoseModel.parse(await file.text());
    if(classIds.length&&!confirm('가져오면 현재 ID와 학습 데이터를 교체합니다. 계속할까요?')){fileStatus('가져오기를 취소했습니다. 기존 데이터는 유지됩니다.');return;}
    if(project.weights){
      if(!isModelReady)throw new Error('PoseNet 로딩이 완료된 뒤 모델을 가져와주세요.');
      restored=PoseClassifier.restore(poseExtractor,project.classIds,project.weights);
      const prediction=await restored.predict(project.samples[0].features);
      if(prediction.some(p=>!Number.isFinite(p.probability)))throw new Error('모델 가중치를 검증하지 못했습니다.');
    }
    const packed=project.weights?PoseModel.encodeFloats(project.weights):null;
    invalidateClassifier();classifier=restored;restored=null;classifierWeights=packed;
    trainingData=project.samples;classIds=[...project.classIds];syncNextClassId();
    // Keep the stored output label order; renderClasses sorts only a copy for display.
    isFlipped=project.settings.isFlipped;byId('mirror-camera').setAttribute('aria-pressed',String(isFlipped));lastSampleFrame=-1;
    renderClasses();setText('result-label',classifier?'모델 준비됨':'샘플 가져옴');setText('result-conf',classifier?'인식 시작을 눌러주세요.':'모델 학습을 눌러주세요.');
    setText('model-status',classifier?'학습된 모델을 복원했습니다. 인식 시작을 눌러주세요.':'샘플을 복원했습니다. 모델 학습을 눌러주세요.');
    byId('model-progress').value=classifier?30:0;
    trainingStatus('샘플을 가져왔습니다. 추가 수집 후에는 모델을 다시 학습해주세요.');
    fileStatus(classIds.length+'개 ID · '+trainingData.length+'개 샘플'+(classifier?' · 학습된 모델 복원 완료':' · 모델 학습 필요'));
  }catch(error){fileStatus('가져오기 실패: '+error.message);}
  finally{PoseClassifier.dispose(restored);byId('model-file-input').value='';isBusy=false;updateControls();}
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
  setText("result-conf", "모델 예측값: " + (result.confidence * 100).toFixed(0) + "%");
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
function drawLandmarks(points) {
  const edges=[[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];
  const visible=p=>p&&p.score>=0.3&&Number.isFinite(p.position.x)&&Number.isFinite(p.position.y);
  const x=p=>isFlipped?width-p.position.x:p.position.x;
  stroke(0,220,130);strokeWeight(3);
  for(const [a,b]of edges)if(visible(points[a])&&visible(points[b]))line(x(points[a]),points[a].position.y,x(points[b]),points[b].position.y);
  noStroke();fill(0,255,160);for(const p of points)if(visible(p))ellipse(x(p),p.position.y,8,8);
}









