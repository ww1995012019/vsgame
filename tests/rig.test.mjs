import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_RIGS, SKIN_SCALE, SKIN_PIVOT, SKIN_BONES, worldJoints, originalPoseFor, createSkinMesh, boneMatrices, skinVertex, twoBoneIK } from '../src/rig.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

test('all sixteen original art poses have complete finite joint bindings',()=>{
  for(const [id,poses] of Object.entries(SOURCE_RIGS)){
    assert.equal(poses.length,8);
    for(const pose of poses)for(const [a,b] of SKIN_BONES){
      assert.ok(Object.values(pose[a]).every(Number.isFinite));
      assert.ok(distance(pose[a],pose[b])>5,`${id}: ${a} / ${b}`);
    }
  }
});

test('bind poses map the original source pixels exactly, without replacing the artwork',()=>{
  for(const id of Object.keys(SOURCE_RIGS))for(let frame=0;frame<8;frame++){
    const mesh=createSkinMesh(id,frame,16),matrices=boneMatrices(id,frame,worldJoints(id,frame)),v=mesh.vertices;
    for(let k=0;k<v.length;k+=12){
      const p=skinVertex(v[k],v[k+1],[...v.slice(k+4,k+8)],[...v.slice(k+8,k+12)],matrices);
      assert.ok(Math.abs(p.x-(v[k]-SKIN_PIVOT[0])*SKIN_SCALE[id])<.001);
      assert.ok(Math.abs(p.y-(v[k+1]-SKIN_PIVOT[1])*SKIN_SCALE[id])<.001);
    }
  }
});

test('mesh influences stay normalized and reference valid bones',()=>{
  for(const id of Object.keys(SOURCE_RIGS))for(let frame=0;frame<8;frame++){
    const {vertices:v,indices}=createSkinMesh(id,frame,16);
    for(let k=0;k<v.length;k+=12){
      const weights=[...v.slice(k+8,k+12)];assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<.00001);
      assert.ok(weights.every(w=>w>=0&&w<=1));assert.ok([...v.slice(k+4,k+8)].every(b=>b>=0&&b<SKIN_BONES.length));
    }
    assert.ok([...indices].every(i=>i<v.length/12));
  }
});

test('attack attachments retain painted proportions and recover to rest',()=>{
  for(const id of Object.keys(SOURCE_RIGS))for(const [type,duration] of [['punch',.31],['kick',.53],['special',.75],['skill',.78]]){
    for(let t=0;t<duration;t+=1/120){
      const pose=originalPoseFor({id,attack:{type,time:t},y:0},t);
      assert.ok(Math.abs(pose.frames.reduce((s,p)=>s+p.weight,0)-1)<.00001);
      for(const {frame} of pose.frames)assert.ok(boneMatrices(id,frame,pose.joints).flat().every(Number.isFinite));
    }
    assert.deepEqual(originalPoseFor({id,attack:{type,time:duration}},0).joints,worldJoints(id,0));
  }
});

test('idle breathing keeps the source soles planted',()=>{
  for(const id of Object.keys(SOURCE_RIGS)){
    const base=originalPoseFor({id,y:0,walkBlend:0},0).joints;
    for(let t=0;t<7;t+=.05){const {joints}=originalPoseFor({id,y:0,walkBlend:0},t);for(const side of ['N','F'])assert.ok(distance(joints['ankle'+side],base['ankle'+side])<.01);}
  }
});

test('walking moves the knees and feet while preserving rigid facial details',()=>{
  for(const id of Object.keys(SOURCE_RIGS)){
    const a=originalPoseFor({id,y:0,walking:true,walkBlend:1,stride:1,move:1,facing:1},1);
    const b=originalPoseFor({id,y:0,walking:true,walkBlend:1,stride:2,move:1,facing:1},1);
    assert.ok(distance(a.joints.ankleN,b.joints.ankleN)>10);
    const matrix=boneMatrices(id,0,a.joints),h=SOURCE_RIGS[id][0].head;
    const p=skinVertex(h.x-8,h.y,[1],[1],matrix),q=skinVertex(h.x+8,h.y,[1],[1],matrix);
    assert.ok(Math.abs(distance(p,q)-16*SKIN_SCALE[id])<.00001);
  }
});

test('skeletal IK remains finite at zero and unreachable target distances',()=>{
  for(const target of [{x:0,y:0},{x:10000,y:-10000}]){
    const root={x:0,y:0},[mid,end]=twoBoneIK(root,target,136,130);
    assert.ok(Object.values(mid).every(Number.isFinite));assert.ok(Math.abs(distance(root,mid)-136)<.00001);assert.ok(Math.abs(distance(mid,end)-130)<.00001);
  }
});

test('both character textures are byte-for-byte identical to the original repository art',()=>{
  const originals={lieying:'d3154848da72396cd0f79d7baaffc834def75070693f824808a806cb869d2a0c',hanfeng:'aaa9ccfb58d9747de0ba54a163c50899be3062a062e388430eceea6ada9551ad'};
  for(const [id,hash] of Object.entries(originals))assert.equal(createHash('sha256').update(readFileSync(new URL(`../public/assets/${id}.png`,import.meta.url))).digest('hex'),hash);
});
