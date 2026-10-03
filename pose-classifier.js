/* Official TM training; fixed Dense/ReLU/Softmax inference from saved Float32 weights. */
(function(root){
'use strict';
function create(extractor,ids){return new tmPose.TeachablePoseNet(tf.sequential(),extractor.posenetModel,{labels:[...ids],modelSettings:PoseModel.SETTINGS});}
function dispose(trainer){if(trainer?.model)trainer.model.dispose();}
async function pack(trainer){
if(trainer.weights)return PoseModel.encodeFloats(trainer.weights);
let packed;
await trainer.model.save(tf.io.withSaveHandler(async a=>{
packed=PoseModel.encodeFloats(new Float32Array(a.weightData));
return {modelArtifactsInfo:{dateSaved:new Date(),modelTopologyType:'JSON',weightDataBytes:a.weightData.byteLength}};
}));
return packed;
}
function restore(extractor,ids,weights){
if(weights.length!==PoseModel.weightCount(ids.length))throw new Error('모델 가중치 크기가 올바르지 않습니다.');
// A small dense head (about 1.5 million multiply-adds per frame) is evaluated
// directly. This avoids backend-dependent single-row GPU matrix operations.
// Training and PoseNet still use TensorFlow/WebGL.
const labels=[...ids],n=PoseModel.FEATURES,u=PoseModel.DENSE_UNITS,c=ids.length;
return {weights:new Float32Array(weights),async predict(features){
if(!PoseModel.validFeatures(features))throw new Error('유효하지 않은 포즈 특징입니다.');
const w=this.weights,hidden=new Float64Array(u),bias=n*u,out=bias+u;
for(let j=0;j<u;j++)hidden[j]=w[bias+j];
for(let i=0;i<n;i++){const x=features[i],row=i*u;for(let j=0;j<u;j++)hidden[j]+=x*w[row+j];}
const logits=new Float64Array(c);
for(let j=0;j<u;j++){const h=Math.max(0,hidden[j]);for(let k=0;k<c;k++)logits[k]+=h*w[out+j*c+k];}
const max=Math.max(...logits);let total=0;
for(let k=0;k<c;k++){logits[k]=Math.exp(logits[k]-max);total+=logits[k];}
return labels.map((className,k)=>({className,probability:logits[k]/total}));
}};
}
root.PoseClassifier={create,dispose,pack,restore};
})(globalThis);
