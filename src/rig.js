import { WALK, JUMP } from './motion.js';

// Original artwork is the skin. These joints refer to the repository's unchanged
// atlas cells normalized to 448 units; the original PNGs are 1774 x 887.
// No replacement character drawing is generated here.
export const SOURCE_CELL = 448;
export const SKIN_PIVOT = [224, 436];
export const SKIN_SCALE = { lieying: 604 / 448, hanfeng: 626 / 448 };
export const JOINT_NAMES = ['hip','neck','head','shoulderN','elbowN','wristN','handN','shoulderF','elbowF','wristF','handF','hipN','kneeN','ankleN','toeN','hipF','kneeF','ankleF','toeF'];
const sourcePose = (values,frame) => {
  const nativeCell=1774/4,normalization=SOURCE_CELL/nativeCell;
  // Measurements were made on a 448-unit review grid over the native atlas.
  return Object.fromEntries(JOINT_NAMES.map((key,i)=>[key,{x:(values[i*2]+frame%4*(SOURCE_CELL-nativeCell))*normalization,y:(values[i*2+1]+Math.floor(frame/4)*(SOURCE_CELL-nativeCell))*normalization}]));
};
export const SOURCE_RIGS = {
  lieying: [
    [210,219,211,105,213,64, 173,122,151,159,177,116,189,99, 248,123,279,158,278,119,274,104, 232,228,286,310,321,401,338,423, 182,230,139,317,88,400,79,424],
    [209,228,217,110,227,76, 166,126,148,164,177,124,192,107, 246,126,309,125,374,115,391,115, 236,240,294,292,319,399,338,424, 184,239,125,322,61,402,53,425],
    [151,192,111,104,115,65, 80,116,53,147,75,110,86,94, 150,104,192,117,233,132,248,130, 174,183,271,145,377,105,401,97, 137,211,133,312,125,400,130,425],
    [239,233,235,130,238,100, 176,147,164,177,185,199,200,205, 268,147,326,148,381,139,395,116, 266,246,337,294,344,397,360,424, 217,246,137,330,38,400,32,424],
    [213,222,215,109,212,76, 175,126,217,145,246,110,260,91, 249,128,279,153,280,111,271,82, 240,239,315,307,349,404,366,426, 182,239,128,327,77,403,67,425],
    [225,193,148,119,110,85, 126,145,104,178,121,200,141,207, 185,130,220,132,252,118,272,106, 250,221,305,292,322,407,343,427, 207,224,187,316,132,397,138,425],
    [222,224,207,116,204,82, 176,138,168,185,136,197,123,187, 250,126,279,102,286,48,285,27, 246,239,283,326,317,405,333,427, 198,240,150,329,103,404,100,427],
    [220,316,230,219,232,182, 188,239,163,272,196,238,211,220, 267,238,286,273,288,231,284,214, 249,326,325,326,299,403,315,426, 190,325,120,335,83,405,82,426],
  ].map(sourcePose),
  hanfeng: [
    [211,221,213,109,222,67, 160,123,144,165,179,129,194,113, 261,127,273,174,289,172,298,161, 235,239,306,322,327,404,349,426, 182,240,125,328,76,405,69,426],
    [206,224,199,110,208,73, 133,126,124,162,156,130,171,113, 236,125,300,119,371,111,389,110, 233,240,284,324,319,404,339,426, 180,241,115,335,65,406,57,426],
    [155,199,115,111,119,72, 66,125,47,166,75,133,88,117, 156,118,191,144,227,155,241,154, 183,200,275,152,375,124,397,116, 137,218,127,325,111,404,115,426],
    [217,245,237,154,254,119, 178,153,138,180,166,210,188,213, 278,161,337,158,393,141,407,120, 251,255,327,292,337,398,360,422, 182,259,107,342,36,407,33,427],
    [211,220,219,116,230,77, 174,129,214,163,243,118,248,99, 260,128,283,163,285,116,282,91, 240,234,300,326,329,405,348,427, 183,237,120,329,79,405,71,427],
    [231,216,148,129,115,88, 138,157,120,199,157,197,179,190, 191,146,232,167,276,145,302,126, 255,232,302,314,307,405,331,427, 208,234,151,332,85,406,79,427],
    [213,228,216,129,224,87, 165,145,120,111,122,56,139,33, 258,157,269,212,308,232,321,222, 241,242,306,329,332,405,353,427, 185,243,118,335,76,407,65,427],
    [218,319,237,212,251,173, 188,223,163,263,202,241,222,223, 274,225,289,274,306,250,303,229, 248,329,326,324,317,403,338,427, 188,327,113,338,72,406,62,427],
  ].map(sourcePose),
};
export const SKIN_BONES = [
  ['hip','neck'], ['neck','head'],
  ['shoulderN','elbowN'], ['elbowN','wristN'], ['wristN','handN'],
  ['shoulderF','elbowF'], ['elbowF','wristF'], ['wristF','handF'],
  ['hipN','kneeN'], ['kneeN','ankleN'], ['ankleN','toeN'],
  ['hipF','kneeF'], ['kneeF','ankleF'], ['ankleF','toeF'],
];
const skinMix = (a,b,t) => a+(b-a)*t;
const smoothSkin = t => {t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const copyJoints = joints => Object.fromEntries(Object.entries(joints).map(([k,p])=>[k,{...p}]));
const mixJoints = (a,b,t) => Object.fromEntries(JOINT_NAMES.map(k=>[k,{x:skinMix(a[k].x,b[k].x,t),y:skinMix(a[k].y,b[k].y,t)}]));
const skinRotate = (p,origin,angle) => ({x:origin.x+(p.x-origin.x)*Math.cos(angle)-(p.y-origin.y)*Math.sin(angle),y:origin.y+(p.x-origin.x)*Math.sin(angle)+(p.y-origin.y)*Math.cos(angle)});
export function worldJoints(id,frame) {
  const scale=SKIN_SCALE[id];
  return Object.fromEntries(Object.entries(SOURCE_RIGS[id][frame]).map(([k,p])=>[k,{x:(p.x-SKIN_PIVOT[0])*scale,y:(p.y-SKIN_PIVOT[1])*scale}]));
}
export function twoBoneIK(root,target,upper,lower,bend=1) {
  const dx=target.x-root.x,dy=target.y-root.y,raw=Math.hypot(dx,dy);
  const d=Math.max(Math.abs(upper-lower)+.0001,Math.min(raw,upper+lower-.0001));
  const ux=raw>.000001?dx/raw:0,uy=raw>.000001?dy/raw:1;
  const along=(upper*upper-lower*lower+d*d)/(2*d),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  return [{x:root.x+ux*along+uy*height*bend,y:root.y+uy*along-ux*height*bend},{x:root.x+ux*d,y:root.y+uy*d}];
}
function poseFrames(f,index,result) {
  if (result && result.winner===index) return [{frame:6,weight:1}];
  if (f.stun>0 && !f.blocking) return [{frame:5,weight:1}];
  if (f.blocking) return [{frame:4,weight:1}];
  if (f.attack) {
    const a=f.attack, data={punch:[1,.09,.20,.31],kick:[2,.18,.32,.53],special:[3,.23,.4,.75],skill:[f.id==='lieying'?1:6,.24,.43,.78]}[a.type];
    const [frame,active,end,duration]=data;
    const weight=a.time<active?smoothSkin(a.time/active):a.time>end?1-smoothSkin((a.time-end)/(duration-end)):1;
    return [{frame:0,weight:1-weight},{frame,weight}].filter(x=>x.weight>.0001);
  }
  return [{frame:0,weight:1}];
}
export function originalPoseFor(f,elapsed=0,index=0,result=null,reducedMotion=false) {
  const frames=poseFrames(f,index,result);
  let joints=worldJoints(f.id,frames[0].frame);
  if(frames.length>1)joints=mixJoints(joints,worldJoints(f.id,frames[1].frame),frames[1].weight);
  const attachment=frames.reduce((a,b)=>a.weight>=b.weight?a:b).frame;
  const layered=!f.attack && !f.stun && !f.blocking && !result;
  let motion=null;
  if(layered){motion=locomotionPose(f,elapsed,index,reducedMotion);joints=motion.joints;}
  else {
    // Different painted poses do not contain compatible hidden arm/torso pixels.
    // Keep each attachment's proportions, with continuous root movement and
    // bounded FK accents; never stretch a guard texture into an uppercut.
    const root={...joints.hip},source=worldJoints(f.id,attachment);
    joints=copyJoints(source);
    for(const p of Object.values(joints)){p.x+=root.x-source.hip.x;p.y+=root.y-source.hip.y;}
    if(f.attack && !reducedMotion){
      const duration={punch:.31,kick:.53,special:.75,skill:.78}[f.attack.type];
      const accent=Math.sin(Math.PI*Math.max(0,Math.min(1,f.attack.time/duration)))*.025;
      const side=f.attack.type==='skill'&&f.id==='hanfeng'?'N':'F';
      for(const name of ['elbow','wrist','hand'])joints[name+side]=skinRotate(joints[name+side],joints['shoulder'+side],accent);
    }
  }
  const effectSide=f.attack?.type==='skill' && f.id==='hanfeng'?(joints.wristN.y<joints.wristF.y?'N':'F'):'F';
  return {frames,attachment,joints,layered,motion,effectHand:joints['hand'+effectSide]};
}
// Sole heights measured from the unchanged source alpha silhouettes (world units).
export const SOLE_LIFT={lieying:{N:2.21,F:2.21},hanfeng:{N:6.53,F:3.70}};
export function walkFoot(phase){
  const u=((phase/(Math.PI*2))%1+1)%1,span=WALK.stride*WALK.stance,amp=span/2;
  if(u<WALK.stance)return {x:amp-u/WALK.stance*span,y:0,pitch:0,contact:true};
  const t=(u-WALK.stance)/(1-WALK.stance),m=-span*(1-WALK.stance)/WALK.stance;
  const x=(2*t*t*t-3*t*t+1)*(-amp)+(t*t*t-2*t*t+t)*m+(-2*t*t*t+3*t*t)*amp+(t*t*t-t*t)*m;
  return {x,y:-WALK.lift*Math.sin(t*Math.PI)**2,pitch:Math.sin(t*Math.PI)*.12,contact:false};
}
export function locomotionPose(f,elapsed=0,index=0,reducedMotion=false){
  const base=worldJoints(f.id,0),joints=copyJoints(base),sole=SOLE_LIFT[f.id];
  const rootLift=Math.max(sole.N,sole.F),targets={},pitches={},contacts={};
  const phase=f.jumpPhase||((f.y||0)>0?'air':'ground'),walking=phase==='ground'?smoothSkin(f.walkBlend??(f.walking?1:0)):0;
  let stage=walking>.001?'walk':'idle',drop=reducedMotion?0:(Math.sin(elapsed*3.6+index*1.7)+1)*.6;
  drop+=walking*(-19+Math.cos((f.stride||0)*2)*1.2);
  let tuck=0;
  if(phase==='prepare') {stage='prepare';drop=16*smoothSkin((f.jumpClock||0)/JUMP.prepare);}
  else if(phase==='air'||f.y>0){
    const t=Math.max(0,Math.min(1,((f.jumpVelocity||JUMP.velocity)-(f.vy||0))/(2*(f.jumpVelocity||JUMP.velocity))));
    tuck=Math.sin(t*Math.PI)**2;stage=(f.vy||0)>110?'rise':(f.vy||0)<-110?'fall':'apex';
    drop=16*(1-smoothSkin((f.jumpClock||0)/.10));
  }else if(phase==='land'){stage='land';drop=16*Math.sin(Math.PI*Math.min(1,(f.jumpClock||0)/JUMP.land));}
  for(const p of Object.values(joints))p.y+=rootLift+drop;
  const breath=reducedMotion?0:Math.sin(elapsed*3.6+index*1.7);
  const lean=breath*.004+walking*(f.move||0)*(f.facing||1)*.025+tuck*.035;
  for(const name of ['neck','head','shoulderN','elbowN','wristN','handN','shoulderF','elbowF','wristF','handF'])joints[name]=skinRotate(joints[name],joints.hip,lean);
  joints.head=skinRotate(joints.head,joints.neck,-lean*.7);
  for(const side of ['N','F']){
    const step=walkFoot((f.stride||0)+(side==='N'?0:Math.PI));
    const a=base['ankle'+side],hip=base['hip'+side],center=hip.x+(side==='N'?66:-66);
    const x=skinMix(a.x,center+step.x,walking),y=a.y+sole[side]+step.y*walking;
    targets[side]={x:skinMix(x,side==='N'?hip.x+68:a.x,tuck),y:y-tuck*(side==='N'?72:12)};
    pitches[side]=step.pitch*walking+tuck*(side==='N'?.13:.06);
    contacts[side]=!tuck && phase!=='air' && (!walking||step.contact);
    const sway=breath*.009+Math.sin((f.stride||0)+(side==='N'?0:Math.PI))*walking*.04;
    for(const name of ['elbow','wrist','hand'])joints[name+side]=skinRotate(joints[name+side],joints['shoulder'+side],sway);
  }
  // A single pelvis correction supports both planted feet; neither leg is stretched.
  let correction=0;
  for(const side of ['N','F']){
    const h=base['hip'+side],k=base['knee'+side],a=base['ankle'+side],target=targets[side];
    const length=Math.hypot(k.x-h.x,k.y-h.y)+Math.hypot(a.x-k.x,a.y-k.y)-(walking?2:.001);
    const dx=target.x-joints['hip'+side].x,maxY=Math.sqrt(Math.max(1,length*length-dx*dx));
    correction=Math.max(correction,target.y-maxY-joints['hip'+side].y);
  }
  if(correction>0)for(const p of Object.values(joints))p.y+=correction;
  for(const side of ['N','F']){
    const h=base['hip'+side],k=base['knee'+side],a=base['ankle'+side],toe=base['toe'+side];
    const upper=Math.hypot(k.x-h.x,k.y-h.y),lower=Math.hypot(a.x-k.x,a.y-k.y);
    const bend=Math.sign((a.y-h.y)*(k.x-h.x)-(a.x-h.x)*(k.y-h.y))||1;
    const [knee,ankle]=twoBoneIK(joints['hip'+side],targets[side],upper,lower,bend);
    joints['knee'+side]=knee;joints['ankle'+side]=ankle;
    const foot={x:ankle.x+toe.x-a.x,y:ankle.y+toe.y-a.y};
    joints['toe'+side]=skinRotate(foot,ankle,pitches[side]);
  }
  return {joints,contacts,phase:stage,walking,tuck,correction};
}
export function headContains(id,frame,p){
  const r=SOURCE_RIGS[id][frame],h=r.head,n=r.neck;
  if(p.x<Math.min(h.x,n.x)-(id==='lieying'?76:62)||p.x>Math.max(h.x,n.x)+54||p.y<h.y-75||p.y>n.y-4)return false;
  if(p.y>h.y+15&&Math.min(distanceBone(p,r.wristN,r.handN),distanceBone(p,r.wristF,r.handF))<13)return false;
  return true;
}
export function partContains(id,frame,p,part,color=null){
  const r=SOURCE_RIGS[id][frame],head=headContains(id,frame,p);
  if(part==='head')return head;
  if(head)return false;
  if(part===null)return true;
  if(part==='body')return p.y<r.hip.y+24||(id==='hanfeng'&&color&&color[0]>color[1]*1.35&&color[0]>color[2]*1.1&&p.y<r.hip.y+93&&p.x>r.hipF.x+12&&p.x<r.hipN.x+42);
  if(p.y<r.hip.y-18)return false;
  const split=(r.hipN.x+r.hipF.x)/2;
  return part==='N'?p.x>=split:p.x<split;
}
export function partWeights(id,frame,p,part=null){
  if(part==='head')return {bones:[1,0,0,0],weights:[1,0,0,0]};
  if(part===null)return vertexWeights(id,frame,p);
  const bones=part==='N'?[8,9,10]:part==='F'?[11,12,13]:[0,1,2,3,4,5,6,7];
  const r=SOURCE_RIGS[id][frame],scores=bones.map(bone=>{const [a,b]=SKIN_BONES[bone];return {bone,score:1/Math.pow(2+distanceBone(p,r[a],r[b]),5)};}).sort((a,b)=>b.score-a.score).slice(0,4);
  if(part==='N'||part==='F'){
    const ankle=r[part==='N'?'ankleN':'ankleF'];
    if(p.y>ankle.y-16)return {bones:[part==='N'?10:13,0,0,0],weights:[1,0,0,0]};
  }
  const sum=scores.reduce((a,b)=>a+b.score,0),out={bones:scores.map(x=>x.bone),weights:scores.map(x=>x.score/sum)};
  while(out.bones.length<4){out.bones.push(0);out.weights.push(0);}return out;
}
// Affine bone transforms map original atlas coordinates to the evaluated pose.
// Separate matrices keep face/hair, hands and shoes rigid at their attachment.
export function boneMatrices(id,frame,target) {
  const source=SOURCE_RIGS[id][frame],scale=SKIN_SCALE[id];
  return SKIN_BONES.map(([from,to],i)=>{
    const a=source[from],b=source[to],c=target[from],d=target[to];
    const sx=b.x-a.x,sy=b.y-a.y,sl=Math.hypot(sx,sy),tx=d.x-c.x,ty=d.y-c.y,tl=Math.hypot(tx,ty);
    const ux=sx/sl,uy=sy/sl,vx=tx/(tl||1),vy=ty/(tl||1),along=[1,4,7,10,13].includes(i)?scale:tl/sl;
    const m0=vx*along*ux+vy*scale*uy,m1=vy*along*ux-vx*scale*uy;
    const m2=vx*along*uy-vy*scale*ux,m3=vy*along*uy+vx*scale*ux;
    return [m0,m1,m2,m3,c.x-m0*a.x-m2*a.y,c.y-m1*a.x-m3*a.y];
  });
}
const distanceBone=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
};
export function vertexWeights(id,frame,p) {
  const r=SOURCE_RIGS[id][frame];
  // Protect the detailed face and hair from nearby raised fists. This region
  // follows the source head axis, rather than coloring or repainting any pixels.
  const hx=r.head.x,hy=r.head.y;
  const headRadiusX=id==='lieying'?52:45,headRadiusY=53;
  if(((p.x-hx)/headRadiusX)**2+((p.y-hy)/headRadiusY)**2<1 && p.y<r.neck.y-5)return {bones:[1,0,0,0],weights:[1,0,0,0]};
  const scores=SKIN_BONES.map(([a,b],bone)=>{
    let d=distanceBone(p,r[a],r[b]);
    if(bone===0)d=Math.max(0,d-20); // broad torso; avoid dragging its cloth with a nearby elbow
    if(bone===8||bone===11)d=Math.max(0,d-11); // loose original trousers
    if([4,7,10,13].includes(bone))d=Math.max(0,d-5);
    return {bone,score:1/Math.pow(3+d,4)};
  }).sort((a,b)=>b.score-a.score).slice(0,4);
  const sum=scores.reduce((s,x)=>s+x.score,0);
  return {bones:scores.map(x=>x.bone),weights:scores.map(x=>x.score/sum)};
}
export function createSkinMesh(id,frame,cells=56,part=null) {
  const vertices=[],indices=[],r=SOURCE_RIGS[id][frame];
  let bounds=[0,0,SOURCE_CELL,SOURCE_CELL];
  if(part==='head')bounds=[Math.max(0,Math.min(r.head.x,r.neck.x)-(id==='lieying'?76:62)),Math.max(0,r.head.y-75),Math.min(SOURCE_CELL,Math.max(r.head.x,r.neck.x)+54),r.neck.y-4];
  else if(part==='N')bounds=[(r.hipN.x+r.hipF.x)/2,r.hip.y-18,SOURCE_CELL,SOURCE_CELL];
  else if(part==='F')bounds=[0,r.hip.y-18,(r.hipN.x+r.hipF.x)/2,SOURCE_CELL];
  else if(part==='body')bounds=[0,0,SOURCE_CELL,Math.min(SOURCE_CELL,r.hip.y+(id==='hanfeng'?93:24))];
  for(let y=0;y<=cells;y++)for(let x=0;x<=cells;x++){
    const px=skinMix(bounds[0],bounds[2],x/cells),py=skinMix(bounds[1],bounds[3],y/cells),w=partWeights(id,frame,{x:px,y:py},part);
    vertices.push(px,py,(frame%4+px/SOURCE_CELL)/4,(Math.floor(frame/4)+py/SOURCE_CELL)/2,...w.bones,...w.weights);
  }
  for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){const a=y*(cells+1)+x,b=a+1,c=a+cells+1,d=c+1;indices.push(a,b,c,b,d,c);}
  return {vertices:new Float32Array(vertices),indices:new Uint16Array(indices),cells};
}
export function skinVertex(x,y,bones,weights,matrices) {
  const p={x:0,y:0};
  bones.forEach((bone,i)=>{const m=matrices[bone],w=weights[i];p.x+=(m[0]*x+m[2]*y+m[4])*w;p.y+=(m[1]*x+m[3]*y+m[5])*w;});
  return p;
}
export function drawSkinBones(ctx,pose) {
  const r=pose.joints;
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle='#8fffe7';
  for(const [a,b] of SKIN_BONES){ctx.beginPath();ctx.moveTo(r[a].x,r[a].y);ctx.lineTo(r[b].x,r[b].y);ctx.stroke();}
  for(const p of Object.values(r)){ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle='#fff7be';ctx.fill();ctx.strokeStyle='#14343a';ctx.lineWidth=1;ctx.stroke();}
  ctx.restore();
}
