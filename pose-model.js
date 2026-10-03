/* Teachable Machine PoseNet project format. No arbitrary model topology is loaded. */
(function(root){
  'use strict';
  const MAX_CLASSES=20, MAX_PER_CLASS=100, MAX_SAMPLES=500, MIN_SAMPLES=10;
  const MAX_BYTES=64*1024*1024, FEATURES=17*17*51, DENSE_UNITS=100;
  const ENGINE=Object.freeze({library:'@teachablemachine/pose',version:'0.8.6',tfjs:'4.22.0',architecture:'MobileNetV1',multiplier:0.75,inputResolution:257,outputStride:16,features:FEATURES,preprocessing:'heatmap-offset-concat-v1',classifier:'dense100-relu-dropout0.5-softmax',mirror:'display-only'});
  const SETTINGS={posenet:{architecture:ENGINE.architecture,multiplier:ENGINE.multiplier,inputResolution:257,outputStride:16}};
  const check=(value,message)=>{if(!value)throw new Error(message);};
  function validFeatures(v){
    if(!(Array.isArray(v)||v instanceof Float32Array)||v.length!==FEATURES)return false;
    for(let i=0;i<v.length;i++){
      if(!Number.isFinite(v[i])||Math.abs(v[i])>10000)return false;
      if(i%51<17&&(v[i]<0||v[i]>1))return false;
    }
    return true;
  }
  // Presence affects hardware output only. It never requires the whole skeleton.
  function hasPerson(pose){return !!(pose&&Array.isArray(pose.keypoints)&&pose.keypoints.filter(p=>p.score>=0.3&&Number.isFinite(p.position?.x)&&Number.isFinite(p.position?.y)).length>=3);}
  function counts(data){const c=Object.create(null);for(const s of data)c[s.label]=(c[s.label]||0)+1;return c;}
  function trainable(ids,data){const c=counts(data);return ids.length>=2&&ids.every(id=>(c[id]||0)>=MIN_SAMPLES);}
  function encodeFloats(values){
    const bytes=new Uint8Array(values.length*4),view=new DataView(bytes.buffer);
    for(let i=0;i<values.length;i++)view.setFloat32(i*4,values[i],true);
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  function decodeFloats(text,count){
    check(typeof text==='string'&&text.length===4*Math.ceil(count*4/3)&&/^[A-Za-z0-9+/]*={0,2}$/.test(text),'저장 데이터의 길이나 인코딩이 올바르지 않습니다.');
    const binary=atob(text);check(binary.length===count*4,'저장 데이터 길이가 올바르지 않습니다.');
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),out=new Float32Array(count);
    for(let i=0;i<count;i++){out[i]=view.getFloat32(i*4,true);check(Number.isFinite(out[i]),'유효하지 않은 숫자 데이터가 있습니다.');}
    return out;
  }
  function weightCount(classes){return FEATURES*DENSE_UNITS+DENSE_UNITS+DENSE_UNITS*classes;}
  function serialize(ids,data,flipped,weights=null){
    return {format:'boundary-x-bodypose-tm',version:2,createdAt:new Date().toISOString(),engine:{...ENGINE},settings:{isFlipped:flipped},classIds:[...ids],samples:data.map(s=>({label:s.label,features:encodeFloats(s.features)})),classifier:weights?{labels:[...ids],weights}:null};
  }
  function parse(text){
    check(typeof text==='string'&&text.length<=MAX_BYTES,'64MiB 이하의 파일을 선택해주세요.');
    let p;try{p=JSON.parse(text);}catch(_){throw new Error('JSON 파일을 읽을 수 없습니다.');}
    if(p?.format==='boundary-x-bodypose-knn')throw new Error('이전 KNN 모델은 특징 데이터가 달라 사용할 수 없습니다. 새 방식으로 샘플을 수집해주세요.');
    check(p?.format==='boundary-x-bodypose-tm'&&p.version===2,'이 앱에서 저장한 포즈 모델 JSON(버전 2)을 선택해주세요.');
    check(p.engine&&Object.keys(ENGINE).every(k=>p.engine[k]===ENGINE[k]),'모델의 특징 추출 방식이 현재 앱과 다릅니다.');
    check(typeof p.settings?.isFlipped==='boolean','화면 설정이 올바르지 않습니다.');
    check(Array.isArray(p.classIds)&&p.classIds.length>0&&p.classIds.length<=MAX_CLASSES,'ID 목록이 올바르지 않습니다.');
    const ids=new Set();for(const id of p.classIds){check(typeof id==='string'&&/^ID[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id.slice(2)))&&!ids.has(id),'중복되거나 잘못된 ID입니다.');ids.add(id);}
    check(Array.isArray(p.samples)&&p.samples.length>0&&p.samples.length<=MAX_SAMPLES,'샘플 수가 올바르지 않습니다.');
    const totals=new Map(),samples=p.samples.map(s=>{
      check(s&&ids.has(s.label),'존재하지 않는 ID의 샘플입니다.');
      const n=(totals.get(s.label)||0)+1;check(n<=MAX_PER_CLASS,'ID당 최대 100개까지 저장할 수 있습니다.');totals.set(s.label,n);
      const features=decodeFloats(s.features,FEATURES);check(validFeatures(features),'PoseNet 특징 데이터가 손상되었습니다.');return {label:s.label,features};
    });
    let weights=null;
    if(p.classifier!==null){
      check(p.classifier&&Array.isArray(p.classifier.labels)&&p.classifier.labels.length===p.classIds.length&&p.classifier.labels.every((id,i)=>id===p.classIds[i])&&trainable(p.classIds,samples),'분류 모델의 ID 또는 샘플 구성이 올바르지 않습니다.');
      weights=decodeFloats(p.classifier.weights,weightCount(p.classIds.length));
    }
    return {classIds:p.classIds,samples,settings:p.settings,weights};
  }
  const api={ENGINE,SETTINGS,MAX_CLASSES,MAX_PER_CLASS,MAX_SAMPLES,MIN_SAMPLES,MAX_BYTES,FEATURES,DENSE_UNITS,validFeatures,hasPerson,counts,trainable,encodeFloats,decodeFloats,weightCount,serialize,parse};
  root.PoseModel=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);

