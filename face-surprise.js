/* Display-only surprise: never paint into the inference/sample canvas. */
(function(root){
 function geometry(points,w,h,mirrored){
   const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&(p.visibility??0)>=.3;
   if(!valid(points?.[2])||!valid(points?.[5]))return null;
   const convert=p=>({x:(mirrored?1-p.x:p.x)*w,y:p.y*h});
   const eyes=[convert(points[2]),convert(points[5])].sort((a,b)=>a.x-b.x);
   const a=eyes[0],b=eyes[1],d=Math.hypot(b.x-a.x,b.y-a.y);
   if(d<6||d>w*.4)return null;
   return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d,angle:Math.atan2(b.y-a.y,b.x-a.x)};
 }
 function hit(g,x,y){
   if(!g)return false;
   const dx=x-g.x,dy=y-g.y,c=Math.cos(g.angle),s=Math.sin(g.angle);
   const localX=(dx*c+dy*s)/g.d,localY=(-dx*s+dy*c)/g.d;
   return (localX/1.7)**2+((localY-.45)/2.1)**2<=1;
 }
 function create(){let count=0,enabled=false;return {
   tap(g,x,y){if(!hit(g,x,y))return false;if(!enabled){count++;enabled=count>=20;}return enabled;},
   get enabled(){return enabled;},get count(){return count;},
   draw(ctx,g){
     if(!enabled||!g)return;
     ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);ctx.scale(g.d,g.d);
     ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#10131a';ctx.lineWidth=.11;
     // Temples and bridge.
     ctx.beginPath();ctx.moveTo(-1.25,-.14);ctx.lineTo(-.95,-.06);ctx.moveTo(.95,-.06);ctx.lineTo(1.25,-.14);ctx.moveTo(-.12,-.04);ctx.quadraticCurveTo(0,-.15,.12,-.04);ctx.stroke();
     const lens=(x)=>{
       const gradient=ctx.createLinearGradient(0,-.32,0,.32);gradient.addColorStop(0,'#263847');gradient.addColorStop(1,'#090c12');
       ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(x-.4,-.3);ctx.lineTo(x+.4,-.3);ctx.quadraticCurveTo(x+.48,-.3,x+.43,-.05);ctx.lineTo(x+.34,.27);ctx.quadraticCurveTo(x,.45,x-.34,.27);ctx.lineTo(x-.43,-.05);ctx.quadraticCurveTo(x-.48,-.3,x-.4,-.3);ctx.closePath();ctx.fill();ctx.stroke();
       ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=.045;ctx.beginPath();ctx.moveTo(x-.25,-.15);ctx.lineTo(x+.04,-.15);ctx.stroke();ctx.strokeStyle='#10131a';ctx.lineWidth=.11;
     };
     lens(-.56);lens(.56);ctx.restore();
   }
 };}
 const api={geometry,hit,create};root.FaceSurprise=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
