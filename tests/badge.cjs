const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('camera badge follows collection, ready, recognition, pose loss and stop states',()=>{
 const elements=new Map(),context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id);}},performance:{now:()=>1000},console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8'),context);
 const check=(setup,expected)=>{vm.runInContext(setup+';updateCameraBadge()',context);assert.equal(elements.get('status-badge').textContent,expected);};
 check('isModelReady=true;frameReady=true;lastFrameSeenAt=1000;poseAvailable=false','자세 미감지 · 샘플 수집 가능');
 check('poseAvailable=true','자세 감지됨 · 샘플 수집 가능');
 check('classifier={}','인식 준비 완료 · 시작을 눌러주세요');
 check('isTracking=true;lastPoseSeenAt=1000','자세 인식 중…');
 check("showPrediction({label:'ID2',confidence:.923})",'ID2 · 92%');
 check('poseAvailable=false;checkPoseFreshness()','사람이 감지되지 않습니다');
 check('poseAvailable=true;lastPoseSeenAt=1000','자세 인식 중…');
 check("showPrediction({label:'ID1',confidence:.81})",'ID1 · 81%');
 check('stopTracking(false)','인식 준비 완료 · 시작을 눌러주세요');
 check('classifier=null','자세 감지됨 · 샘플 수집 가능');
 check('trainingCandidate={}','모델 학습 중…');
 check('cancelTraining=true','모델 학습 취소 중…');
 check('trainingCandidate=null;frameReady=false','카메라 영상을 기다리는 중…');
 check('modelLoadFailed=true','모델 로드 실패');
});

