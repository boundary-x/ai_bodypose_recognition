const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));});
function pose(){const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1})); [[11,.4,.3],[12,.6,.3],[13,.3,.45],[14,.7,.45],[15,.3,.6],[16,.7,.6],[23,.43,.55],[24,.57,.55],[25,.43,.7],[26,.57,.7],[27,.43,.9],[28,.57,.9]].forEach(([i,x,y])=>p[i]={x,y,visibility:1});return p;}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r)); const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});try{
const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.TEST_URL||`http://127.0.0.1:${server.address().port}`);
await page.waitForFunction(()=>typeof isModelReady!=='undefined'&&(isModelReady||modelLoadFailed),null,{timeout:120000});
assert.equal(await page.evaluate(()=>isModelReady),true,'real Pose Lite model must load');
await page.waitForFunction(()=>video.elt.readyState>=2&&lastVideoTime>=0);
console.log('PASS real model initialization and camera inference');
await page.evaluate(p=>{window.fixture=p;poseLandmarker.detectForVideo=()=>({landmarks:[window.fixture]});},pose());
await page.waitForFunction(()=>poseAvailable); await page.click('#add-class-btn');
await page.click('.train-btn');assert.equal(await page.evaluate(()=>trainingData.length),1);
await page.locator('.train-btn').focus();await page.keyboard.press('Space'); assert.equal(await page.evaluate(()=>trainingData.length),2);
const b=await page.locator('.train-btn').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(850);await page.mouse.up();assert.ok(await page.evaluate(()=>trainingData.length)>=4);
const count=await page.evaluate(()=>trainingData.length);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>trainingData.length),count);
await page.click('#add-class-btn');await page.click('#add-class-btn'); page.once('dialog',d=>d.accept());await page.click('[aria-label="ID2 삭제"]');await page.click('#add-class-btn');assert.deepEqual(await page.evaluate(()=>classIds),['ID1','ID2','ID3']);
await page.evaluate(()=>{window.sent=[];bluetoothDevice={gatt:{connected:true,disconnect(){}}};rxCharacteristic={writeValue:async bytes=>window.sent.push(new TextDecoder().decode(bytes))};isConnected=true;startTracking();});
await page.waitForFunction(()=>window.sent.includes('ID1\n'));await page.evaluate(()=>window.fixture=null);await page.waitForFunction(()=>window.sent.includes('stop\n'));
assert.equal(await page.locator('.train-btn').first().isDisabled(),true);console.log('PASS tap, keyboard, hold, ID reuse, mocked BLE ID and pose-loss stop');
await page.evaluate(p=>window.fixture=p,pose());await page.waitForFunction(()=>poseAvailable);
const exported=await page.evaluate(async()=>await makeModelFile().text());await page.evaluate(()=>{trainingData=[];classIds=[];renderClasses();updateControls();});
await page.setInputFiles('#model-file-input',{name:'body.json',mimeType:'application/json',buffer:Buffer.from(exported)});await page.waitForFunction(()=>trainingData.length>0);assert.equal(await page.evaluate(()=>trainingData.length),count);
await page.setInputFiles('#model-file-input',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"boundary-x-handpose-knn"}')});await page.waitForFunction(()=>document.getElementById('file-status').textContent.startsWith('가져오기 실패'));assert.equal(await page.evaluate(()=>trainingData.length),count);console.log('PASS actual file input restore and invalid-file preservation');
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
for(const [w,h] of [[1280,900],[768,1024],[390,844],[320,740],[844,390]]){
 await page.setViewportSize({width:w,height:h});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);
 const r=await page.evaluate(()=>{const c=document.getElementById('p5-container').getBoundingClientRect();return {w:c.width,h:c.height,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.ok(Math.abs(r.w/r.h-4/3)<.03,JSON.stringify(r));assert.equal(r.overflow,false,`${w}: overflow`);
 if(w===390){await page.evaluate(()=>window.scrollTo(0,600));const s=await page.locator('#p5-container').boundingBox();assert.ok(s.y>=0);await page.screenshot({path:path.join(root,'test-results/mobile.png')});}
}
await page.setViewportSize({width:1280,height:900});await page.click('[data-help=""]');await page.click('[data-tour="all"]');for(let i=0;i<13;i++){assert.ok(await page.locator('#guide-title').textContent());await page.click('#guide-next');}assert.equal(await page.locator('#guide-dialog').isVisible(),false);
await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(root,'test-results/desktop.png')});assert.deepEqual(errors,[]);console.log('PASS responsive layouts, complete guide and no JavaScript errors');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
