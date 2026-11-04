import test from 'node:test';
import assert from 'node:assert/strict';
import {attackFor} from '../src/engine.js';
import {originalPoseFor,worldJoints,boneMatrices,SKIN_SCALE,partWeights} from '../src/rig.js';

const ids=['lieying','hanfeng'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fighter=(id,extra={})=>({id,y:0,vy:0,jumpPhase:'ground',jumpClock:.376,jumpVelocity:790,walkBlend:0,stride:0,move:0,facing:1,stun:0,blocking:false,state:'Idle',stateTime:0,...extra});
const attack=(id,type,time,extra={})=>fighter(id,{state:'LightAttack',stateTime:time,attack:{type,time,move:attackFor(id,type)},...extra});
const legs=['hipN','kneeN','ankleN','toeN','hipF','kneeF','ankleF','toeF'];

test('air punches, skills and hit reactions retain the complete jump lower body',()=>{
  for(const id of ids)for(const vy of [600,0,-600]){
    const airborne={y:140,vy,jumpPhase:'air'},base=originalPoseFor(fighter(id,airborne),1);
    for(const type of ['punch','special','skill'])for(const time of [0,.045,.12,.24]){
      const pose=originalPoseFor(attack(id,type,time,airborne),1);
      for(const key of legs)assert.ok(distance(pose.joints[key],base.joints[key])<1e-8,`${id} ${type} ${key}`);
      for(const channel of pose.channels.filter(c=>['N','F'].includes(c.part)))assert.equal(channel.frame,0);
    }
    for(const stateTime of [0,.045,.12]){
      const pose=originalPoseFor(fighter(id,{...airborne,state:'Hit',stateTime,stun:.3}),1);
      for(const key of legs)assert.ok(distance(pose.joints[key],base.joints[key])<1e-8);
    }
  }
});

test('the former mid-startup attachment boundary no longer teleports either hand',()=>{
  for(const id of ids)for(const type of ['punch','kick','special','skill']){
    const a=originalPoseFor(attack(id,type,.0449),1),b=originalPoseFor(attack(id,type,.0451),1);
    assert.equal(a.attachment,b.attachment);
    for(const key of Object.keys(a.joints))assert.ok(distance(a.joints[key],b.joints[key])<1,`${id} ${type} ${key}`);
  }
});

test('bounded Lieying motion is continuous and both fighters recover at configured duration',()=>{
  for(const id of ids)for(const type of ['punch','kick','special','skill']){
    const move=attackFor(id,type);let previous=null;
    for(let n=0;n<=Math.ceil(move.duration*120);n++){
      const time=Math.min(n/120,move.duration),pose=originalPoseFor(attack(id,type,time),1);
      if(time<move.duration&&id==='lieying')assert.equal(pose.attachment,move.frame);
      if(previous&&id==='lieying')for(const key of Object.keys(pose.joints))assert.ok(distance(pose.joints[key],previous.joints[key])<36,`${id} ${type} ${key}`);
      previous=pose;
    }
    const end=originalPoseFor(attack(id,type,move.duration),1),rest=originalPoseFor(fighter(id),1);
    assert.deepEqual(end.joints,rest.joints);
  }
});

test('Hanfeng uses intact original key poses at actual active frames without invented interpolation',()=>{
  for(const type of ['punch','kick','special','skill']){
    const move=attackFor('hanfeng',type),startup=originalPoseFor(attack('hanfeng',type,move.active-.001),1),active=originalPoseFor(attack('hanfeng',type,move.active+.001),1),recovery=originalPoseFor(attack('hanfeng',type,move.end+.001),1);
    assert.equal(startup.attachment,0);assert.equal(active.attachment,move.frame);assert.equal(recovery.attachment,0);
    const channel=active.channels.find(c=>c.part==='body'||c.part==='full'),source=worldJoints('hanfeng',move.frame);
    for(const side of ['N','F'])for(const [from,to] of [['shoulder','elbow'],['elbow','wrist']])assert.ok(Math.abs(distance(channel.joints[from+side],channel.joints[to+side])-distance(source[from+side],source[to+side]))<1e-8);
    assert.ok(active.resourceLimits.some(limit=>limit.includes('key poses')));
  }
});

test('Hanfeng key poses share the combat active boundary after normal sixty Hz accumulation',()=>{
  for(const type of ['punch','kick','special','skill']){
    const move=attackFor('hanfeng',type);let time=0;
    for(let frame=0;frame<move.startupFrames;frame++)time+=1/60;
    assert.equal(originalPoseFor(attack('hanfeng',type,time),1).attachment,move.frame,`${type} first active frame`);
    for(let frame=0;frame<move.activeFrames;frame++)time+=1/60;
    assert.equal(originalPoseFor(attack('hanfeng',type,time),1).attachment,0,`${type} first recovery frame`);
  }
});

test('render channels draw one rigid original head and never blend two painted heads',()=>{
  for(const id of ids)for(const type of ['punch','kick','special','skill'])for(const time of [0,.045,.12,.24]){
    const pose=originalPoseFor(attack(id,type,time),1),heads=pose.channels.filter(c=>c.part==='head');
    assert.equal(heads.length,1);assert.equal(heads[0].frame,id==='hanfeng'?pose.attachment:0);
    assert.ok(pose.channels.every(c=>c.opacity===undefined||c.opacity===1));
    const m=boneMatrices(id,heads[0].frame,heads[0].joints)[1];
    assert.ok(Math.abs(Math.hypot(m[0],m[1])-SKIN_SCALE[id])<1e-8);
    assert.ok(Math.abs(Math.hypot(m[2],m[3])-SKIN_SCALE[id])<1e-8);
  }
});

test('painted upper-arm and forearm segments cannot stretch beyond twenty percent',()=>{
  for(const id of ids)for(const type of ['punch','kick','special','skill']){
    const move=attackFor(id,type);
    for(let n=0;n<=60;n++){
      const pose=originalPoseFor(attack(id,type,n/60*move.duration),1),channel=pose.channels.find(c=>c.part==='body'||c.part==='full'),source=worldJoints(id,channel.frame);
      for(const side of ['N','F'])for(const [from,to] of [['shoulder','elbow'],['elbow','wrist']]){
        const ratio=distance(channel.joints[from+side],channel.joints[to+side])/distance(source[from+side],source[to+side]);
        assert.ok(ratio<=1.200001,`${id} ${type} ${from} ${side}: ${ratio}`);
      }
    }
  }
});

test('crouching lowers the pelvis while both original sole contacts remain planted',()=>{
  for(const id of ids){
    const rest=originalPoseFor(fighter(id),1),crouch=originalPoseFor(fighter(id,{state:'Crouch',stateTime:.12}),1);
    assert.ok(crouch.joints.hip.y-rest.joints.hip.y>80);
    for(const key of ['ankleN','ankleF'])assert.ok(distance(rest.joints[key],crouch.joints[key])<1e-8);
    assert.equal(crouch.motion.phase,'crouch');
    assert.equal(crouch.channels.find(c=>c.part==='body').frame,0,'the crouch crop must not duplicate its painted knees');
  }
});

test('crouch release uses the engine blend rather than snapping immediately upright',()=>{
  for(const id of ids){
    const down=originalPoseFor(fighter(id,{state:'Crouch',crouchBlend:1}),1),release=originalPoseFor(fighter(id,{state:'Idle',crouchBlend:.99}),1),rest=originalPoseFor(fighter(id),1);
    assert.ok(Math.abs(down.joints.hip.y-release.joints.hip.y)<1);
    assert.ok(release.joints.hip.y-rest.joints.hip.y>80);
  }
});

test('shirt pixels inside the shoulder line remain bound to the torso',()=>{
  for(const id of ids){
    const p=partWeights(id,1,{x:210,y:170},'body');
    assert.deepEqual(p,{bones:[0,0,0,0],weights:[1,0,0,0]});
  }
});

test('missing air-kick and floor recovery artwork is explicitly reported',()=>{
  for(const id of ids){
    assert.ok(originalPoseFor(attack(id,'kick',.12,{y:140,jumpPhase:'air'}),1).resourceLimits.length);
    const landing=originalPoseFor(attack(id,'kick',.3,{y:0,jumpPhase:'land',attack:{type:'kick',time:.3,airborne:true,move:attackFor(id,'kick')}}),1);
    assert.equal(landing.attachment,0);
    for(const state of ['Knockdown','GetUp'])assert.ok(originalPoseFor(fighter(id,{state}),1).resourceLimits.length);
  }
});
