const assert=require('node:assert/strict'),F=require('../face-surprise.js');
const points=[];points[2]={x:.3,y:.25,visibility:1};points[5]={x:.4,y:.3,visibility:1};
const g=F.geometry(points,640,480,false),mirror=F.geometry(points,640,480,true);
assert(Math.abs(g.x+mirror.x-640)<1e-6);assert(Math.abs(g.angle+mirror.angle)<1e-6);
const egg=F.create();for(let i=0;i<30;i++)egg.tap(g,600,470);assert.equal(egg.count,0);
for(let i=0;i<19;i++)egg.tap(g,g.x,g.y);assert.equal(egg.enabled,false);egg.tap(g,g.x,g.y);assert.equal(egg.enabled,true);egg.tap(g,g.x,g.y);assert.equal(egg.count,20);
assert.equal(F.geometry(null,640,480,true),null);assert.equal(F.hit(null,10,10),false);
assert.equal(F.hit(mirror,mirror.x,mirror.y),true);points[2].visibility=.1;assert.equal(F.geometry(points,640,480,false),null);
console.log('PASS: face-only clicks, exactly 20 unlock, mirrored/tilted geometry, missing/low-confidence face guard');
