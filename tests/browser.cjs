const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const f=path.join(root,pathname==='/'?'index.html':pathname);if(!f.startsWith(root)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await page.goto(process.env.TEST_URL||`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>typeof isModelReady!=='undefined'&&(isModelReady||modelLoadFailed),null,{timeout:120000});assert.ok(await page.evaluate(()=>isModelReady),'PoseNet should load');
 await page.waitForFunction(()=>frameReady,null,{timeout:30000});assert.equal(await page.evaluate(()=>lastFeatures.length),14739);console.log('PASS real official PoseNet extraction (14,739 features)');
 await page.evaluate(()=>{
  window.originalEstimate=poseExtractor.estimatePose.bind(poseExtractor);
  window.fixtureFeatures=k=>Float32Array.from({length:PoseModel.FEATURES},(_,i)=>i%51<17?(i%51===k?.9:.01):0);
  window.partialPose={keypoints:Array.from({length:17},(_,i)=>({score:i<11?.9:.01,position:{x:220+(i%2)*140,y:50+Math.floor(i/2)*35}}))};
  window.currentClass=0;window.personVisible=true;
  poseExtractor.estimatePose=async()=>({posenetOutput:fixtureFeatures(currentClass),pose:personVisible?partialPose:undefined});
 });
 await page.waitForFunction(()=>poseAvailable);await page.click('#add-class-btn');await page.click('.train-btn');assert.equal(await page.evaluate(()=>trainingData.length),1);
 await page.evaluate(()=>{collectSample('ID1');const n=trainingData.length;collectSample('ID1');if(trainingData.length!==n)throw new Error('same frame collected twice');});
 const b=await page.locator('.train-btn').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(800);await page.mouse.up();assert.ok(await page.evaluate(()=>trainingData.length)>=3);
 await page.click('#add-class-btn');assert.equal(await page.locator('#train-model-btn').isDisabled(),true);
 await page.evaluate(async()=>{trainingData=[];for(let c=0;c<2;c++)for(let i=0;i<10;i++){await handlePoseResult({posenetOutput:fixtureFeatures(c),pose:partialPose});collectSample('ID'+(c+1));}});
 assert.equal(await page.locator('#train-model-btn').isDisabled(),false);assert.equal(await page.locator('#start-track-btn').isDisabled(),true);
 console.log('PASS partial upper-body samples, hold, duplicate frame and train/start gates');
 await page.click('#train-model-btn');await page.waitForFunction(()=>!isBusy,null,{timeout:120000});
 assert.ok(await page.evaluate(()=>!!classifier),await page.locator('#model-status').textContent());
 const predictions=await page.evaluate(async()=>[await classifier.predict(fixtureFeatures(0)),await classifier.predict(fixtureFeatures(1))]);
 assert.equal(predictions[0].sort((a,b)=>b.probability-a.probability)[0].className,'ID1');assert.equal(predictions[1].sort((a,b)=>b.probability-a.probability)[0].className,'ID2');console.log('PASS real Teachable Machine neural training and two-class prediction');
 await page.evaluate(()=>{window.sent=[];bluetoothDevice={gatt:{connected:true,disconnect(){}}};rxCharacteristic={writeValue:async bytes=>sent.push(new TextDecoder().decode(bytes))};isConnected=true;startTracking();});await page.waitForFunction(()=>sent.includes('ID1\n'));
 await page.evaluate(()=>personVisible=false);await page.waitForFunction(()=>sent.includes('stop\n'));assert.equal(await page.locator('.train-btn').first().isDisabled(),false,'no all-joint collection gate');
 await page.evaluate(()=>personVisible=true);await page.waitForFunction(()=>poseAvailable);console.log('PASS mocked BLE ID, missing-person stop and unrestricted collection');
 const numerical=await page.evaluate(async()=>{
  isBusy=true;while(inferenceBusy)await new Promise(r=>setTimeout(r,20));
  stopTracking();const backend=tf.getBackend();await tf.setBackend('cpu');
  const model=tf.sequential({layers:[tf.layers.dense({inputShape:[PoseModel.FEATURES],units:100,activation:'relu',useBias:true}),tf.layers.dropout({rate:.5}),tf.layers.dense({units:2,activation:'softmax',useBias:false})]});
  const w=PoseModel.decodeFloats(classifierWeights,PoseModel.weightCount(2));let offset=0;const tensors=[];
  for(const shape of [[PoseModel.FEATURES,100],[100],[100,2]]){const size=shape.reduce((a,b)=>a*b,1);tensors.push(tf.tensor(w.slice(offset,offset+size),shape));offset+=size;}
  model.setWeights(tensors);tensors.forEach(t=>t.dispose());
  const differences=[];
  for(let c=0;c<2;c++){const input=tf.tensor2d(fixtureFeatures(c),[1,PoseModel.FEATURES]),output=model.predict(input),reference=Array.from(await output.data()),actual=await classifier.predict(fixtureFeatures(c));differences.push(...reference.map((v,i)=>Math.abs(v-actual[i].probability)));input.dispose();output.dispose();}
  model.dispose();await tf.setBackend(backend);isBusy=false;return Math.max(...differences);
 });assert.ok(numerical<1e-5,'direct head must match TensorFlow CPU reference');console.log('PASS dense head matches TensorFlow CPU within 1e-5');
 const saved=await page.evaluate(()=>makeModelFile().text());
 await page.evaluate(()=>{stopForChange();invalidateClassifier();trainingData=[];classIds=[];renderClasses();updateControls();});
 await page.setInputFiles('#model-file-input',{name:'pose.json',mimeType:'application/json',buffer:Buffer.from(saved)});await page.waitForFunction(()=>!isBusy&&!!classifier);
 const after=await page.evaluate(()=>classifier.predict(fixtureFeatures(0)));after.forEach(p=>assert.ok(Math.abs(p.probability-predictions[0].find(x=>x.className===p.className).probability)<1e-6));
 const invalid=JSON.parse(saved);invalid.classifier.weights='bad';await page.setInputFiles('#model-file-input',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>!isBusy);assert.ok(await page.evaluate(()=>!!classifier));assert.equal(await page.evaluate(()=>trainingData.length),20);
 await page.setInputFiles('#model-file-input',{name:'knn.json',mimeType:'application/json',buffer:Buffer.from('{"format":"boundary-x-bodypose-knn"}')});await page.waitForFunction(()=>!isBusy);assert.ok((await page.locator('#file-status').textContent()).includes('KNN'));assert.ok(await page.evaluate(()=>!!classifier));
 console.log('PASS learned weights round trip preserves predictions; malformed and KNN files preserve current project');
 await page.evaluate(async()=>{const previous=classifier;const promise=trainModel();setTimeout(cancelModelTraining,50);await promise;if(classifier!==previous)throw new Error('cancel replaced existing classifier');});assert.ok((await page.locator('#model-status').textContent()).includes('취소'));assert.equal(await page.evaluate(()=>trainingData.length),20);
 await page.evaluate(async()=>{await handlePoseResult({posenetOutput:fixtureFeatures(0),pose:partialPose});collectSample('ID1');});assert.equal(await page.evaluate(()=>classifier),null);assert.ok(await page.locator('#start-track-btn').isDisabled());
 await page.click('#add-class-btn');page.once('dialog',d=>d.accept());await page.click('[aria-label="ID2 삭제"]');await page.click('#add-class-btn');assert.deepEqual(await page.evaluate(()=>[...classIds].sort()),['ID1','ID2','ID3']);console.log('PASS cancellation, stale-model invalidation and lowest-free-ID reuse');
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});for(const [w,h]of [[1280,900],[768,1024],[390,844],[320,740],[844,390]]){await page.setViewportSize({width:w,height:h});await page.evaluate(()=>scrollTo(0,0));const r=await page.evaluate(()=>{const b=document.getElementById('p5-container').getBoundingClientRect();return {ratio:b.width/b.height,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.ok(Math.abs(r.ratio-4/3)<.03);assert.equal(r.overflow,false);if(w===390)await page.screenshot({path:path.join(root,'test-results/mobile-tm.png')});}
 await page.setViewportSize({width:1280,height:900});await page.click('[data-help=""]');await page.click('[data-tour="all"]');for(let i=0;i<13;i++)await page.click('#guide-next');assert.equal(await page.locator('#guide-dialog').isVisible(),false);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,'test-results/desktop-tm.png')});assert.deepEqual(errors,[]);console.log('PASS responsive layout and all guide steps');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});



