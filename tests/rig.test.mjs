import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIONS, sampleMotion, solveRig, BONE_LENGTHS, twoBoneIK, poseFor } from '../src/rig.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
test('every attack keeps articulated bones attached at constant lengths throughout the clip', () => {
  for (const [name, keys] of Object.entries(MOTIONS)) {
    for (let time = 0; time <= keys.at(-1)[0]; time += 1 / 120) {
      const rig = solveRig(sampleMotion(keys, time));
      for (const [a, b, length] of [
        ['hip', 'chest', BONE_LENGTHS.torso],
        ['shoulderN', 'elbowN', BONE_LENGTHS.upperArm], ['elbowN', 'wristN', BONE_LENGTHS.forearm],
        ['shoulderF', 'elbowF', BONE_LENGTHS.upperArm], ['elbowF', 'wristF', BONE_LENGTHS.forearm],
        ['hipN', 'kneeN', BONE_LENGTHS.thigh], ['kneeN', 'ankleN', BONE_LENGTHS.shin],
        ['hipF', 'kneeF', BONE_LENGTHS.thigh], ['kneeF', 'ankleF', BONE_LENGTHS.shin],
      ]) assert.ok(Math.abs(distance(rig[a], rig[b]) - length) < .00001, `${name} @ ${time}: ${a}-${b}`);
    }
  }
});

test('idle breathing keeps both feet planted, and keyed clips recover to the same stance', () => {
  const reference = solveRig(poseFor({ y: 0 }, 0));
  for (let t = 0; t < 7; t += .03) {
    const rig = solveRig(poseFor({ y: 0 }, t));
    assert.ok(distance(rig.ankleN, reference.ankleN) < .001);
    assert.ok(distance(rig.ankleF, reference.ankleF) < .001);
  }
  for (const keys of Object.values(MOTIONS)) assert.deepEqual(sampleMotion(keys, 0), sampleMotion(keys, keys.at(-1)[0]));
});

test('unreachable and coincident IK targets stay finite without changing bone lengths', () => {
  for (const target of [{ x: 0, y: 0 }, { x: 10000, y: 10000 }, { x: .0000001, y: 0 }]) {
    const root = { x: 0, y: 0 }, [joint, end] = twoBoneIK(root, target, 136, 130);
    assert.ok(Object.values(joint).every(Number.isFinite));
    assert.ok(Math.abs(distance(root, joint) - 136) < .00001);
    assert.ok(Math.abs(distance(joint, end) - 130) < .00001);
  }
});

// An active straight punch should align with its world-space hit height even
// while the torso leans; body rotation must not turn it into an uppercut.
test('straight punches stay horizontal during torso lean', () => {
  for (const [clip, time] of [['punch', .09], ['dash', .24]]) {
    const rig = solveRig(sampleMotion(MOTIONS[clip], time));
    assert.ok(Math.abs(rig.elbowN.y - rig.wristN.y) < 12);
    assert.ok(rig.wristN.x > rig.shoulderN.x + 150);
  }
});
