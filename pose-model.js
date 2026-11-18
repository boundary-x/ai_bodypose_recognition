/* MediaPipe Lite + masked landmark KNN. No TensorFlow dependency. */
(function(root){
 'use strict';
 const JOINTS=[0,11,12,13,14,15,16,23,24,25,26,27,28], FEATURES=JOINTS.length*3;
 const FORMAT='boundaryx-mediapipe-pose-knn', VERSION=1;
 const counts=samples=>samples.reduce((out,s)=>(out[s.label]=(out[s.label]||0)+1,out),{});
 function validFeatures(f){return f&&f.length===FEATURES&&Array.from(f).every(Number.isFinite)&&JOINTS.every((_,i)=>f[i*3+2]>=0&&f[i*3+2]<=1);}
 function extract(points){
   const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&(p.visibility??0)>=.6;
   if(!points||!visible(points[11])||!visible(points[12]))return null;
   const a=points[11],b=points[12],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
   // Inference frames are 4:3. Correct normalized coordinates for aspect ratio.
   const scale=Math.hypot((a.x-b.x)*4/3,a.y-b.y);
   if(scale<.045)return null;
   const f=new Float32Array(FEATURES);let seen=0;
   JOINTS.forEach((j,i)=>{const p=points[j];if(visible(p)){f[i*3]=(p.x-cx)*4/3/scale;f[i*3+1]=(p.y-cy)/scale;f[i*3+2]=p.visibility;seen++;}});
   // Shoulders anchor the coordinates; any additional reliable landmark adds
   // pose information. Wrists/elbows are not mandatory for a cropped upper body.
   return seen>=3?f:null;
 }
 function distance(a,b){
   let sum=0,weight=0,common=0,reference=0,union=0;
   for(let i=0;i<FEATURES;i+=3){if(b[i+2]>=.6)reference++;if(a[i+2]>=.6||b[i+2]>=.6)union++;if(a[i+2]<.6||b[i+2]<.6)continue;const w=Math.min(a[i+2],b[i+2]);sum+=w*((a[i]-b[i])**2+(a[i+1]-b[i+1])**2);weight+=w;common++;}
   const shared=j=>{const i=JOINTS.indexOf(j)*3;return a[i+2]>=.6&&b[i+2]>=.6;};
   if(!shared(11)||!shared(12)||common<3||common<Math.ceil(reference*.75))return Infinity;
   // A neutral, cropped sample must not win solely because its shoulders match
   // every raised-arm pose. Treat missing/visible landmark differences as evidence.
   return Math.sqrt(sum/weight)+.8*(1-common/union);
 }
 function predict(features,samples){
   const total=counts(samples),neighbors=samples.filter(s=>total[s.label]>=10).map(s=>({label:s.label,d:distance(features,s.features)})).sort((a,b)=>a.d-b.d);
   if(!neighbors.length||neighbors[0].d>.4)return null;
   const votes=new Map();for(const n of neighbors.slice(0,5)){if(n.d>.4)continue;votes.set(n.label,(votes.get(n.label)||0)+1/(.05+n.d));}
   const ranked=[...votes].sort((a,b)=>b[1]-a[1]);if(!ranked.length)return null;
   const confidence=ranked[0][1]/[...votes.values()].reduce((a,b)=>a+b,0);
   const competitor=neighbors.find(n=>n.label!==ranked[0][0]);
   if(confidence<.65||(competitor&&competitor.d-neighbors[0].d<.04))return null;
   return {label:ranked[0][0],confidence};
 }
 function serialize(ids,samples,isFlipped){return {format:FORMAT,version:VERSION,engine:'pose_landmarker_lite',features:'shoulder-normalized-2d-mask-v1',classIds:ids,samples:samples.map(s=>({label:s.label,features:Array.from(s.features)})),settings:{isFlipped}};}
 function parse(text){
   const p=JSON.parse(text),fail=m=>{throw Error(m)};
   if(p.format!==FORMAT||p.version!==VERSION||p.features!=='shoulder-normalized-2d-mask-v1')fail('이 파일은 MediaPipe KNN 포즈 파일이 아닙니다. 기존 PoseNet 샘플은 다시 수집해주세요.');
   if(!Array.isArray(p.classIds)||p.classIds.length>20||new Set(p.classIds).size!==p.classIds.length||p.classIds.some(id=>typeof id!=='string'||!/^ID[1-9]\d{0,5}$/.test(id)))fail('ID 형식이 올바르지 않습니다.');
   if(!Array.isArray(p.samples)||p.samples.length>500)fail('샘플 수가 올바르지 않습니다.');
   for(const s of p.samples)if(!s||!p.classIds.includes(s.label)||!validFeatures(s.features)||s.features.some(v=>Math.abs(v)>100))fail('샘플 데이터가 올바르지 않습니다.');
   if(Object.values(counts(p.samples)).some(n=>n>100))fail('ID당 최대 100개까지 가져올 수 있습니다.');
   return {classIds:p.classIds,samples:p.samples.map(s=>({label:s.label,features:new Float32Array(s.features)})),settings:{isFlipped:p.settings?.isFlipped!==false}};
 }
 const api={JOINTS,FEATURES,MAX_CLASSES:20,MAX_PER_CLASS:100,MAX_SAMPLES:500,MAX_BYTES:4*1024*1024,counts,validFeatures,extract,distance,predict,serialize,parse};
 root.PoseModel=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
