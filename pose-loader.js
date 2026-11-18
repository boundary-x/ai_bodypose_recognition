/* Pin JS/WASM together; Lite task runs locally once downloaded. */
window.loadPoseLandmarker=async()=>{
 const base='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';
 const {FilesetResolver,PoseLandmarker}=await import(base+'/vision_bundle.mjs');
 const vision=await FilesetResolver.forVisionTasks(base+'/wasm');
 const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'GPU'},runningMode:'VIDEO',numPoses:1,outputSegmentationMasks:false};
 try{return await PoseLandmarker.createFromOptions(vision,options);}
 catch(error){console.warn('GPU pose initialization failed; retrying CPU',error);options.baseOptions.delegate='CPU';return await PoseLandmarker.createFromOptions(vision,options);}
};
