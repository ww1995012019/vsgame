import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ATTACKS, CHARACTERS, WORLD } from '../src/engine.js';
import { COMBAT_RULES, overlaps, guardAllows, movePhase } from '../src/combat.js';
import { originalPoseFor } from '../src/rig.js';

const step = (game, frames = 1, samples = 1) => {
  for (let frame = 0; frame < frames * samples; frame++) game.update(1 / (60 * samples));
};
const setup = () => {
  const game = new Game({ random: () => .5 });
  game.start({ training: true });
  game.fighters[0].x = 650; game.fighters[1].x = 805;
  return game;
};
const wait = (game, predicate, limit = 240) => {
  for (let frame = 0; frame < limit && !predicate(); frame++) step(game);
  assert.ok(predicate(), 'the expected state must be reached within the frame budget');
};

test('round duration defaults to 99 seconds and remains configurable', () => {
  assert.equal(new Game().roundSeconds, 99);
  const game = new Game({ roundSeconds: 60 }); game.start();
  assert.equal(game.timer, 60);
  game.start({ roundSeconds: 45 }); assert.equal(game.timer, 45);
});

test('character combat parameters expose both directional speeds and resource limits', () => {
  for (const data of Object.values(CHARACTERS)) {
    for (const key of ['maxHp', 'forwardSpeed', 'backSpeed', 'jumpVelocity', 'weight', 'defense', 'maxEnergy']) assert.ok(data[key] > 0, key);
    assert.ok(data.backSpeed < data.forwardSpeed);
  }
});

test('debug frames match 60 Hz startup/active/recovery and show actual rectangles', () => {
  const game = setup(); game.fighters[1].x = 1200; game.attack(0, 'punch');
  step(game, 5);
  let view = game.getDebugSnapshot().fighters[0];
  assert.equal(view.state, 'LightAttack'); assert.equal(view.moveFrame, 5);
  assert.equal(view.activePhase, 'startup'); assert.equal(view.hitboxes.length, 0);
  step(game);
  view = game.getDebugSnapshot().fighters[0];
  assert.equal(view.moveFrame, 6); assert.equal(view.activePhase, 'active');
  assert.ok(view.hitboxes.length > 0); assert.equal(view.pushbox.width, 115);
  assert.ok(view.hurtboxes.length > 1);
  step(game, 7);
  view = game.getDebugSnapshot().fighters[0];
  assert.equal(view.activePhase, 'recovery'); assert.equal(view.hitboxes.length, 0);
  step(game, 6); assert.equal(game.fighters[0].attack, null);
  assert.equal(game.getDebugSnapshot().fighters[0].lastHit.result, 'miss');
});

test('melee must overlap a hurtbox during an active frame, once per move', () => {
  const game = setup(); game.attack(0, 'punch');
  step(game, 5); assert.equal(game.fighters[1].hp, 100);
  step(game); assert.equal(game.fighters[1].hp, 94);
  const view = game.getDebugSnapshot();
  assert.ok(view.fighters[0].hitboxes.some(hit => view.fighters[1].hurtboxes.some(hurt => overlaps(hit, hurt))));
  step(game, 60); assert.equal(game.fighters[1].hp, 94);
  assert.equal(game.trainingHits, 1);
});

test('being airborne does not grant immunity when a leg remains inside the attack', () => {
  const game = setup(); const target = game.fighters[1];
  target.y = 300; target.jumpPhase = 'air';
  game.attack(0, 'punch'); step(game, 6);
  assert.equal(target.hp, 94, 'the actual lower-body overlap must receive the hit');
  const clear = setup(); clear.fighters[1].y = 650; clear.fighters[1].jumpPhase = 'air';
  clear.attack(0, 'punch'); step(clear, 10);
  assert.equal(clear.fighters[1].hp, 100, 'no overlapping body part means no hit');
});

test('simultaneous matching punches trade regardless of fighter update order', () => {
  for (const first of [0, 1]) {
    const game = setup(); game.fighters[1].id = 'lieying';
    game.attack(first, 'punch'); game.attack(1 - first, 'punch'); step(game, 6);
    assert.deepEqual(game.fighters.map(f => f.hp), [94, 94]);
    assert.ok(game.fighters.every(f => f.state === 'Hit'));
  }
});

test('wall contact transfers the entire body separation to the free fighter', () => {
  const game = setup(), [a, b] = game.fighters;
  a.x = 175; b.x = 225; game.resolveBodies();
  assert.deepEqual([a.x, b.x], [175, 290]);
  a.x = 1375; b.x = 1425; game.resolveBodies();
  assert.deepEqual([a.x, b.x], [1310, 1425]);
  a.x = 700; b.x = 700; game.resolveBodies();
  assert.equal(Math.abs(a.x - b.x), COMBAT_RULES.pushWidth);
});

test('landing locks movement, attacks, jump and guard until the landing phase ends', () => {
  const game = setup(); game.fighters[1].x = 1200;
  game.jump(0); wait(game, () => game.fighters[0].jumpPhase === 'land');
  const f = game.fighters[0], x = f.x;
  assert.equal(f.state, 'Landing');
  for (const type of ['punch', 'kick', 'special', 'skill']) assert.equal(game.attack(0, type), false);
  assert.equal(game.jump(0), false);
  game.setInput('right', true); game.setInput('block', true); step(game, 5);
  assert.equal(f.x, x); assert.equal(f.blocking, false);
  wait(game, () => f.jumpPhase === 'ground');
  game.setInput('block', false); step(game, 2); assert.ok(f.x > x);
});

test('only the supported aerial punch can start in flight and it ends on touchdown', () => {
  const game = setup(); game.fighters[1].x = 1200;
  game.jump(0); wait(game, () => game.fighters[0].y > 50);
  assert.equal(game.attack(0, 'skill'), false); assert.equal(game.attack(0, 'special'), false);
  assert.equal(game.attack(0, 'kick'), false, 'no matching aerial kick artwork exists');
  assert.equal(game.attack(0, 'punch'), true);
  assert.equal(game.fighters[0].attack.airborne, true);
  wait(game, () => game.fighters[0].jumpPhase === 'land');
  assert.equal(game.fighters[0].attack, null); assert.equal(game.fighters[0].state, 'Landing');
});

test('movement is classified relative to facing after changing sides', () => {
  const game = setup(); const [a, b] = game.fighters;
  a.x = 1000; b.x = 600;
  game.setInput('right', true); step(game);
  assert.equal(a.facing, -1); assert.equal(a.state, 'WalkBackward');
  const x = a.x; step(game, 6); assert.ok(Math.abs(a.x - x - CHARACTERS.lieying.backSpeed / 10) < .001);
  game.setInput('right', false); game.setInput('left', true); step(game);
  assert.equal(a.state, 'WalkForward');
});

test('backward movement guards an incoming attack, while forward movement does not', () => {
  const guarded = setup(); guarded.setInput('left', true); guarded.attack(1, 'punch'); step(guarded, 10);
  assert.equal(guarded.fighters[0].hp, 99); assert.equal(guarded.fighters[0].state, 'Block');
  const open = setup(); open.setInput('right', true); open.attack(1, 'punch'); step(open, 10);
  assert.equal(open.fighters[0].hp, 93);
  const swapped = setup(); swapped.fighters[0].x = 805; swapped.fighters[1].x = 650;
  swapped.fighters[1].facing = 1;
  swapped.setInput('right', true); swapped.attack(1, 'punch'); step(swapped, 10);
  assert.equal(swapped.fighters[0].hp, 99);
});

test('crouch changes the hurtboxes; guard height and attack direction are respected', () => {
  const game = setup(); const standing = game.getDebugSnapshot().fighters[0].hurtboxes;
  game.setInput('crouch', true); step(game);
  const f = game.fighters[0], crouched = game.getDebugSnapshot().fighters[0].hurtboxes;
  assert.equal(f.state, 'Crouch');
  assert.ok(Math.min(...crouched.map(b => b.y)) > Math.min(...standing.map(b => b.y)));
  f.blocking = true;
  assert.equal(guardAllows(f, { height: 'low' }, -1), true);
  assert.equal(guardAllows(f, { height: 'high' }, -1), false);
  assert.equal(guardAllows(f, { height: 'low' }, 1), false);
  f.crouching = false;
  assert.equal(guardAllows(f, { height: 'low' }, -1), false);
  assert.equal(guardAllows(f, { height: 'high' }, -1), true);
});

test('crouch blend also eases back to standing after releasing the key', () => {
  const game = setup(); const f = game.fighters[0];
  game.setInput('crouch', true); step(game, 3);
  assert.ok(Math.abs(f.crouchBlend - .5) < 1e-7);
  game.setInput('crouch', false); step(game);
  assert.equal(f.state, 'Idle');
  assert.ok(f.crouchBlend > 0 && f.crouchBlend < .5, 'standing resumes without a pose discontinuity');
  step(game, 4); assert.equal(f.crouchBlend, 0);
});

test('both head hurtboxes follow the actual crouch transition and include the crown', () => {
  for (const id of ['lieying', 'hanfeng']) {
    const game = setup(); game.start({ training: true, playerId: id });
    const f = game.fighters[0]; let previousY = null;
    for (const pressed of [true, false]) {
      game.setInput('crouch', pressed);
      for (let frame = 0; frame < 12; frame++) {
        step(game);
        const pose = originalPoseFor(f, game.elapsed), box = game.getDebugSnapshot().fighters[0].hurtboxes[0];
        const head = { x: f.x + pose.joints.head.x * f.facing, y: WORLD.floor - f.y + pose.joints.head.y };
        assert.ok(head.x >= box.x && head.x <= box.x + box.width);
        assert.ok(head.y - 60 >= box.y && head.y <= box.y + box.height, `${id}: head and crown remain inside the head hurtbox`);
        if (previousY !== null) assert.ok(Math.abs(box.y - previousY) < 30, 'press/release must not snap the head hurtbox');
        previousY = box.y;
      }
    }
  }
});

test('ground strike boxes include the painted glove, raised foot or frost palm throughout active frames', () => {
  for (const id of ['lieying', 'hanfeng']) for (const type of ['punch', 'kick', 'skill']) {
    const game = setup(); game.start({ training: true, playerId: id });
    game.fighters[1].x = 1400; game.attack(0, type);
    const f = game.fighters[0], move = f.attack.move;
    for (let activeFrame = 0; activeFrame < move.activeFrames; activeFrame++) {
      f.attack.time = (move.startupFrames + activeFrame) / 60;
      const pose = originalPoseFor(f, 0);
      const joint = pose.joints[type === 'kick' ? 'toeN' : 'handF'];
      const point = { x: f.x + joint.x * f.facing, y: WORLD.floor - f.y + joint.y };
      assert.ok(game.getDebugSnapshot().fighters[0].hitboxes.some(box => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height), `${id} ${type} ${activeFrame}: painted contact must lie inside its damage box`);
    }
  }
});

test('blockstun cannot be cancelled into movement or an attack by releasing guard', () => {
  const game = setup(); game.setInput('block', true); game.attack(1, 'punch'); step(game, 6);
  assert.equal(game.fighters[0].stunKind, 'block');
  game.hitStop = 0;
  game.setInput('block', false); game.setInput('right', true);
  const x = game.fighters[0].x;
  assert.equal(game.attack(0, 'punch'), false);
  step(game);
  assert.equal(game.fighters[0].state, 'Block'); assert.equal(game.fighters[0].blocking, true);
  assert.equal(game.fighters[0].walking, false);
  assert.ok(Math.abs(game.fighters[0].x - x) < 2, 'only the small physical guard push may move the fighter');
});

test('input taps keep chronological order rather than a hardcoded move priority', () => {
  const game = setup();
  game.setInput('punch', true); game.setInput('punch', false);
  game.setInput('kick', true); game.setInput('kick', false);
  step(game);
  assert.equal(game.fighters[0].attack.type, 'punch');
  assert.equal(game.inputQueue[0].action, 'kick');
});

test('expired input cannot fire after a long recovery, while a late buffer can', () => {
  const game = setup(); game.fighters[1].x = 1200;
  game.attack(0, 'kick'); game.setInput('punch', true); step(game, 45);
  assert.equal(game.fighters[0].attack, null); assert.equal(game.inputQueue.length, 0);
  game.attack(0, 'kick'); step(game, 28); game.setInput('punch', true); step(game, 5);
  assert.equal(game.fighters[0].attack.type, 'punch');
});

test('only a confirmed hit permits the configured light-to-heavy cancel', () => {
  const game = setup(); game.attack(0, 'punch');
  assert.equal(game.attack(0, 'kick'), false, 'startup cannot cancel');
  step(game, 6);
  assert.equal(game.fighters[0].attack.confirmedHit, true);
  assert.equal(game.attack(0, 'kick'), true);
  assert.equal(game.attack(0, 'punch'), false, 'heavy-to-light is not in the cancel table');
  const whiff = setup(); whiff.fighters[1].x = 1200; whiff.attack(0, 'punch'); step(whiff, 7);
  assert.equal(whiff.attack(0, 'skill'), false, 'a miss must recover');
  const block = setup(); block.fighters[0].blocking = true; block.setInput('block', true);
  block.attack(1, 'punch'); step(block, 6);
  assert.equal(block.fighters[1].attack.confirmedHit, false);
  assert.equal(block.attack(1, 'skill'), false, 'this move only allows hit confirms');
});

test('light-heavy-skill cancels form a true combo and recovery clears its counter', () => {
  const game = setup(); game.attack(0, 'punch'); step(game, 6);
  game.setInput('kick', true);
  wait(game, () => game.trainingHits === 2);
  assert.equal(game.matchStats.maxCombo, 2);
  game.setInput('skill', true);
  wait(game, () => game.trainingHits === 3);
  assert.equal(game.matchStats.maxCombo, 3);
  wait(game, () => game.fighters[1].stun === 0);
  assert.equal(game.fighters[0].combo, 0); assert.equal(game.comboDisplay[0], 0);
  wait(game, () => !game.fighters[0].attack);
  game.fighters[0].x = 650; game.fighters[1].x = 805; game.attack(0, 'punch'); step(game, 6);
  assert.equal(game.fighters[0].combo, 1); assert.equal(game.matchStats.maxCombo, 3);
});

test('a swept projectile hits a crossed hurtbox instead of tunnelling past it', () => {
  const game = setup(); game.fighters[1].x = 1000;
  game.projectiles.push({ owner: 0, x: 600, y: WORLD.strikeHeight, direction: 1, life: 1, age: 0, speed: 30000, radius: 20 });
  assert.equal(game.getDebugSnapshot().projectileHitboxes.length, 1);
  step(game); assert.equal(game.fighters[1].hp, 79);
  assert.equal(game.projectiles.length, 0);
});

test('a launch keeps visible body boxes, locks through landing and ends the combo on recovery', () => {
  const game = setup(); game.start({ training: true, playerId: 'hanfeng' });
  game.fighters[0].x = 650; game.fighters[1].x = 805;
  game.attack(0, 'skill'); wait(game, () => game.fighters[1].state === 'Knockback');
  assert.equal(game.attack(1, 'punch'), false);
  wait(game, () => game.fighters[1].state === 'Landing');
  assert.equal(game.getDebugSnapshot().fighters[1].hurtboxes.length, 4);
  assert.equal(game.fighters[1].invincible, 0, 'no fake invulnerable get-up is added');
  assert.equal(game.jump(1), false);
  assert.equal(game.attack(1, 'punch'), false); assert.equal(game.fighters[0].combo, 1);
  wait(game, () => game.fighters[1].state === 'Idle');
  assert.equal(game.fighters[1].launchRecovery, false); assert.equal(game.fighters[0].combo, 0);
  assert.equal(game.attack(1, 'punch'), true);
});

test('60 Hz and 120 Hz hosts use identical move frames and damage boundaries', () => {
  for (const samples of [1, 2]) {
    const game = setup(); game.attack(0, 'punch'); step(game, 5, samples);
    assert.equal(game.fighters[1].hp, 100);
    assert.equal(movePhase(ATTACKS.punch, game.fighters[0].attack.time), 'startup');
    step(game, 1, samples); assert.equal(game.fighters[1].hp, 94);
  }
});

test('projectile emission occurs on its first configured active frame at either sample rate', () => {
  for (const samples of [1, 2]) {
    const game = setup(); game.fighters[1].x = 1200; game.attack(0, 'special');
    step(game, ATTACKS.special.startupFrames - 1, samples);
    assert.equal(game.projectiles.length, 0);
    step(game, 1, samples);
    assert.equal(game.getDebugSnapshot().fighters[0].activePhase, 'active');
    assert.equal(game.projectiles.length, 1);
  }
});

test('hitstun and invincibility end on their configured frame without floating point residue', () => {
  for (const samples of [1, 2]) {
    const game = setup(); game.attack(0, 'punch'); step(game, ATTACKS.punch.startupFrames, samples);
    game.hitStop = 0;
    const victim = game.fighters[1]; victim.invincible = ATTACKS.punch.stun;
    step(game, ATTACKS.punch.hitStunFrames - 1, samples);
    assert.ok(victim.stun > 0); assert.equal(game.attack(1, 'punch'), false);
    step(game, 1, samples);
    assert.equal(victim.stun, 0); assert.equal(victim.invincible, 0);
    assert.equal(victim.state, 'Idle'); assert.equal(game.attack(1, 'punch'), true);
  }
});
