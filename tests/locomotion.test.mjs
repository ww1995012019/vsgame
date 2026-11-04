import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/engine.js';
import {WALK} from '../src/motion.js';
import {originalPoseFor,worldJoints,partWeights,walkFoot} from '../src/rig.js';
const tick=(g,seconds)=>{for(let t=0;t<seconds;t+=1/120)g.update(1/120);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

test('head and each leg have isolated influences, preventing arm/hair and leg/leg tearing',()=>{
 for(const id of ['lieying','hanfeng'])for(const part of ['head','N','F']){
  const allowed=part==='head'?[1]:part==='N'?[8,9,10]:[11,12,13];
  for(let y=0;y<=448;y+=14)for(let x=0;x<=448;x+=14){const v=partWeights(id,0,{x,y},part);v.bones.forEach((bone,i)=>{if(v.weights[i]>.000001)assert.ok(allowed.includes(bone));});}
 }
});

test('planted walking feet remain fixed in world space in both movement directions',()=>{
 for(const id of ['lieying','hanfeng'])for(const sign of [-1,1]){
  const phase=.04,delta=.003*sign,dx=WALK.stride*delta;
  const a=originalPoseFor({id,x:500,y:0,walkBlend:1,stride:phase*Math.PI*2,move:sign,facing:1},0);
  const b=originalPoseFor({id,x:500+dx,y:0,walkBlend:1,stride:(phase+delta)*Math.PI*2,move:sign,facing:1},0);
  for(const side of ['N','F']){
   assert.ok(a.motion.contacts[side]&&b.motion.contacts[side]);
   assert.ok(Math.abs(500+a.joints['ankle'+side].x-(500+dx+b.joints['ankle'+side].x))<.001);
   assert.ok(Math.abs(a.joints['ankle'+side].y-b.joints['ankle'+side].y)<.001);
  }
 }
});

test('the gait closes smoothly and has a planted supporting foot throughout',()=>{
 for(let i=0;i<=500;i++){
  const phase=i/500*Math.PI*2,a=walkFoot(phase),b=walkFoot(phase+Math.PI);
  assert.ok(a.contact||b.contact);
  assert.ok(a.y<=.0001&&b.y<=.0001);
 }
 const before=walkFoot(Math.PI*2-1e-7),after=walkFoot(1e-7);
 assert.ok(distance(before,after)<.001);
});

test('both jump graphs keep bone lengths and upper-body proportions, using the standing skin',()=>{
 for(const id of ['lieying','hanfeng']){
  const g=new Game();g.start({training:true,playerId:id});g.jump(0);const base=worldJoints(id,0),seen=new Set();let previous=null;
  for(let n=0;n<145;n++){
   const f=g.fighters[0],pose=originalPoseFor(f,g.elapsed),r=pose.joints;seen.add(pose.motion.phase);
   assert.equal(pose.attachment,0);assert.equal(pose.layered,true);
   assert.ok(Math.abs(distance(r.hip,r.neck)-distance(base.hip,base.neck))<.001);
   for(const side of ['N','F'])for(const [a,b] of [['hip','knee'],['knee','ankle']])assert.ok(Math.abs(distance(r[a+side],r[b+side])-distance(base[a+side],base[b+side]))<.001);
   if(previous)for(const key of Object.keys(r))assert.ok(distance(r[key],previous[key])<18,'jump transitions must not snap a joint');
   previous=r;g.update(1/120);
  }
  for(const phase of ['prepare','rise','apex','fall','land','idle'])assert.ok(seen.has(phase),phase);
 }
});

test('a correctly timed jump clears the opponent and turns after landing',()=>{
 const g=new Game();g.start({training:true});g.fighters[0].x=650;g.fighters[1].x=805;g.jump(0);g.setInput('right',true);tick(g,.73);g.setInput('right',false);
 assert.ok(g.fighters[0].x>g.fighters[1].x,'the grounded body push must not block an airborne crossover');
 assert.equal(g.fighters[0].facing,1,'facing stays stable in flight');tick(g,.5);assert.equal(g.fighters[0].facing,-1);
});

test('jump damage follows actual body overlap rather than root-height immunity',()=>{
 for(const projectile of [false,true])for(const clear of [false,true]){
  const g=new Game();g.start({training:true});g.fighters[0].x=650;g.fighters[1].x=805;g.jump(0);tick(g,.42);
  assert.ok(g.fighters[0].y>110);
  if(clear)g.fighters[0].x=300; // Clear the painted arm's full reach, including the outer leg hurtbox.
  if(projectile)g.projectiles.push({owner:1,x:660,y:420,direction:-1,life:1,age:0,speed:100,radius:62});else g.attack(1,'punch');
  tick(g,.12);
  if(clear)assert.equal(g.fighters[0].hp,100,'a body outside the real boxes must remain unharmed');
  else assert.ok(g.fighters[0].hp<100,'an overlapping airborne leg can still be hit');
 }
});

test('landing keeps the feet planted before held movement resumes',()=>{
 const g=new Game();g.start({training:true});g.jump(0);g.setInput('right',true);
 while(g.fighters[0].jumpPhase!=='land')g.update(1/120);
 const landed=g.fighters[0].x;tick(g,.10);assert.equal(g.fighters[0].x,landed);
 tick(g,.15);assert.ok(g.fighters[0].x>landed);
});
