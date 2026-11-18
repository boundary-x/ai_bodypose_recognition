const assert=require('node:assert/strict'),M=require('../pose-model.js'),T=require('../training-input.js');
function pose(raised=false){const p=Array.from({length:33},()=>({x:0,y:0,visibility:0}));for(const [i,x,y] of [[0,.5,.15],[11,.4,.3],[12,.6,.3],[13,.32,.45],[14,.68,.45],[15,.26,raised?.1:.65],[16,.74,raised?.1:.65],[23,.42,.65],[24,.58,.65]])p[i]={x,y,visibility:1};return p;}
const f=M.extract(pose()),g=M.extract(pose(true));assert(f);assert.equal(M.extract([]),null);
function singleArm(side){const p=pose(true),keep=side==='left'?[11,12,13,15]:[11,12,14,16];p.forEach((v,i)=>{if(!keep.includes(i))v.visibility=0});return p;}
const left=M.extract(singleArm('left')),right=M.extract(singleArm('right'));
assert(left,'left arm + shoulders only must be collectable');assert(right,'right arm + shoulders only must be collectable');
assert.equal(M.distance(left,left),0);assert.equal(M.distance(right,right),0);assert.equal(M.distance(left,right),Infinity);
assert.equal(M.predict(left,Array.from({length:10},()=>({label:'ID1',features:left}))).label,'ID1');
const incomplete=singleArm('left');incomplete[15].visibility=0;assert(M.extract(incomplete));
const neutral=pose();neutral.forEach((p,i)=>{if(![0,11,12].includes(i))p.y=1.2});
const neutralFeatures=M.extract(neutral);assert(neutralFeatures,'nose + shoulders must allow hands-down collection');
assert.equal(M.distance(neutralFeatures,neutralFeatures),0);
const shouldersOnly=singleArm('left');shouldersOnly[13].visibility=shouldersOnly[15].visibility=0;assert.equal(M.extract(shouldersOnly),null);
const neutralSamples=Array.from({length:10},()=>({label:'ID3',features:neutralFeatures}));
assert.equal(M.predict(neutralFeatures,neutralSamples).label,'ID3');
assert.equal(M.predict(g,neutralSamples),null,'raised arms must not match a sparse neutral sample');
const missingShoulder=singleArm('left');missingShoulder[12].visibility=0;assert.equal(M.extract(missingShoulder),null);
const moved=pose().map(p=>({...p,x:.1+p.x*.8,y:.1+p.y*.8}));assert(M.distance(f,M.extract(moved))<1e-6);
const samples=[...Array.from({length:10},()=>({label:'ID1',features:f})),...Array.from({length:10},()=>({label:'ID2',features:g}))];
assert.equal(M.predict(f,samples).label,'ID1');assert.equal(M.predict(g,samples).label,'ID2');assert.equal(M.predict(f,samples.slice(0,9)),null);
assert.equal(M.predict(f,[...samples.slice(0,10),...Array.from({length:10},()=>({label:'ID2',features:f}))]),null);
const parsed=M.parse(JSON.stringify(M.serialize(['ID1','ID2'],samples,true)));assert.equal(M.predict(parsed.samples[0].features,parsed.samples).label,'ID1');assert.throws(()=>M.parse('{"version":2}'));
let now=0,fn=null,available=true,total=0,changes=[];
const c=T.createController({now:()=>now,schedule:f=>(fn=f,1),unschedule:()=>fn=null,collect:()=>available?(total++,true):false,onChange:s=>changes.push(s)});
function advance(n){for(let j=0;j<n/100;j++){now+=100;const f=fn;fn=null;f?.();}}
c.start('ID1');advance(4900);assert.equal(total,0);advance(100);assert.equal(total,1);available=false;advance(2000);assert.equal(total,1);assert.equal(c.state.phase,'paused');available=true;advance(5000);assert.equal(total,10);assert.equal(c.state.phase,'done');advance(5000);assert.equal(total,10);
c.start('ID2');advance(5500);assert.equal(total,12);c.stop();advance(5000);assert.equal(total,12);assert.equal(c.state.phase,'cancelled');
c.start('ID1');available=false;advance(65000);assert.equal(c.state.phase,'timeout');assert.equal(total,12);
console.log('PASS: 5s countdown, fresh successful samples only, pause/resume, exact 10 limit, cancel/timeout; normalized masked KNN, ambiguity rejection, import/export');
