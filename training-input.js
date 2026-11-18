/* A click starts one finite batch. Valid frames only; never collect in background. */
(function(root){
 function createController({collect,onStart,onChange,now=()=>performance.now(),schedule=setTimeout,unschedule=clearTimeout}){
   let timer=null,state={phase:'idle',id:null,count:0},deadline=0,next=0,expires=0;
   const emit=()=>onChange?.({...state});
   function stop(reason='cancelled'){unschedule(timer);timer=null;if(!['countdown','collecting','paused'].includes(state.phase))return;state={...state,phase:reason};emit();}
   function tick(){
     if(!['countdown','collecting','paused'].includes(state.phase))return;
     const t=now();
     if(t<deadline){const seconds=Math.ceil((deadline-t)/1000);if(seconds!==state.seconds){state.seconds=seconds;emit();}}
     else if(t>=expires){stop('timeout');return;}
     else if(t>=next){
       const success=collect(state.id);
       if(success===true){state.count++;state.phase='collecting';next=t+500;}
       else if(success==='limit'){stop('limit');return;}
       else {state.phase='paused';next=t+100;}
       if(state.count===10){state.phase='done';timer=null;emit();return;}
       emit();
     }
     timer=schedule(tick,100);
   }
   function start(id){stop();state={phase:'countdown',id,count:0,seconds:5};deadline=now()+5000;expires=deadline+60000;next=deadline;onStart?.();emit();timer=schedule(tick,100);}
   return {start,stop,bind(button,id){button.addEventListener('click',()=>start(id));},get active(){return ['countdown','collecting','paused'].includes(state.phase)},get state(){return {...state}}};
 }
 const api={createController};root.TrainingInput=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
