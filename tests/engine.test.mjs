import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD } from '../src/engine.js';

const tick = (game, seconds) => { for (let t = 0; t < seconds; t += 1 / 120) game.update(1 / 120); };
const training = () => { const game = new Game({ random: () => .5 }); game.start({ training: true }); return game; };
const closeRange = game => { game.fighters[0].x = 650; game.fighters[1].x = 805; };

test('starts a real match with an intro, a running clock, and best-of-three score', () => {
  const game = new Game();
  assert.equal(game.state, 'ready');
  game.start();
  assert.equal(game.state, 'intro');
  tick(game, 2.5);
  assert.equal(game.state, 'playing');
  tick(game, 1);
  assert.ok(game.timer < 90 && game.timer > 88);
  assert.deepEqual(game.wins, [0, 0]);
});

test('walking is frame-rate independent and constrained to the arena', () => {
  const game = training();
  const start = game.fighters[0].x;
  game.setInput('right', true); tick(game, .5);
  assert.ok(game.fighters[0].x > start + 150);
  game.setInput('right', false); game.setInput('left', true); tick(game, 6);
  assert.equal(game.fighters[0].x, 175);
  assert.ok(game.fighters[0].x < WORLD.width);
});

test('jump uses gravity, lands, and cannot be retriggered in midair', () => {
  const game = training();
  game.jump(0); tick(game, .15);
  assert.ok(game.fighters[0].y > 70);
  assert.equal(game.jump(0), false);
  tick(game, 1);
  assert.equal(game.fighters[0].y, 0);
  assert.equal(game.fighters[0].vy, 0);
});

test('punch only connects inside its active window, once per attack', () => {
  const game = training(); closeRange(game);
  assert.equal(game.attack(0, 'punch'), true);
  tick(game, .05); assert.equal(game.fighters[1].hp, 100);
  tick(game, .12); assert.equal(game.fighters[1].hp, 94);
  tick(game, .5); assert.equal(game.fighters[1].hp, 94);
  assert.equal(game.matchStats.hits, 1);
});

test('out-of-range punches miss and cannot damage an airborne target', () => {
  const game = training();
  game.attack(0, 'punch'); tick(game, .5);
  assert.equal(game.fighters[1].hp, 100);
  closeRange(game); game.fighters[1].y = 300; game.fighters[1].vy = 0;
  game.attack(0, 'punch'); tick(game, .12);
  assert.equal(game.fighters[1].hp, 100);
});

test('guard reduces incoming damage and earns energy', () => {
  const game = training(); closeRange(game);
  game.fighters[0].energy = 0;
  game.setInput('block', true);
  game.attack(1, 'kick'); tick(game, .4);
  assert.ok(game.fighters[0].hp >= 97);
  assert.ok(game.fighters[0].energy > 5);
});

test('special requires energy and releases a traveling projectile', () => {
  const game = training();
  game.fighters[0].energy = 20;
  assert.equal(game.attack(0, 'special'), false);
  game.fighters[0].energy = 50;
  assert.equal(game.attack(0, 'special'), true);
  assert.equal(game.fighters[0].energy, 0);
  tick(game, .3);
  assert.equal(game.projectiles.length, 1);
  tick(game, .7);
  assert.ok(game.fighters[1].hp < 100);
  assert.equal(game.matchStats.hits, 1);
});

test('rapid hits count as a combo and expire after a gap', () => {
  const game = training(); closeRange(game);
  game.attack(0, 'punch'); tick(game, .4);
  closeRange(game); game.attack(0, 'punch'); tick(game, .4);
  assert.equal(game.matchStats.maxCombo, 2);
  tick(game, 1.5);
  closeRange(game); game.attack(0, 'punch'); tick(game, .4);
  assert.equal(game.fighters[0].combo, 1);
  assert.equal(game.matchStats.hits, 3);
});

test('pause freezes physics, attacks, timer, and effects', () => {
  const game = training(); closeRange(game); game.attack(0, 'kick');
  game.setPaused(true);
  const snapshot = JSON.stringify({ fighters: game.fighters, timer: game.timer, particles: game.particles });
  tick(game, 2);
  assert.equal(JSON.stringify({ fighters: game.fighters, timer: game.timer, particles: game.particles }), snapshot);
  game.setPaused(false); tick(game, .4);
  assert.ok(game.fighters[1].hp < 100);
});

test('two round wins finish a match; restart clears all transient state', () => {
  const events = [], game = new Game({ onEvent: e => events.push(e) });
  game.start(); tick(game, 2.5);
  game.fighters[1].hp = 0; tick(game, .02);
  assert.equal(game.state, 'roundOver');
  assert.deepEqual(game.wins, [1, 0]);
  game.nextRound(); tick(game, 2.5);
  assert.equal(game.fighters[1].hp, 100);
  game.fighters[1].hp = 0; tick(game, .02);
  assert.equal(game.state, 'matchOver');
  assert.deepEqual(game.wins, [2, 0]);
  assert.ok(events.some(e => e.type === 'roundEnd' && e.finished));
  game.start();
  assert.deepEqual(game.wins, [0, 0]);
  assert.equal(game.round, 1);
  assert.equal(game.result, null);
  assert.equal(game.matchStats.hits, 0);
});

test('timeout resolves by life, ties award neither player a round', () => {
  const game = new Game(); game.start(); tick(game, 2.5);
  game.fighters[0].hp = 80; game.fighters[1].hp = 50; game.timer = .01;
  tick(game, .04);
  assert.equal(game.result.reason, 'timeout'); assert.equal(game.result.winner, 0);
  game.nextRound(); tick(game, 2.5); game.timer = .01;
  tick(game, .04);
  assert.equal(game.result.winner, -1); assert.deepEqual(game.wins, [1, 0]);
});

test('training has no timeout and respawns the practice opponent after a knockout', () => {
  const game = training(); game.timer = .01; tick(game, .1);
  assert.equal(game.state, 'playing'); assert.equal(game.timer, .01);
  game.fighters[1].hp = 0; tick(game, .02);
  assert.equal(game.fighters[1].hp, 100);
  assert.equal(game.state, 'playing');
});

test('the computer approaches and actually attacks without player input', () => {
  const game = new Game({ random: () => .5 }); game.start();
  tick(game, 12);
  assert.ok(game.fighters[0].hp < 100, 'AI must damage the idle player');
  assert.ok(game.fighters[1].x < 1130, 'AI must approach');
});

test('selecting the other character swaps both fighters and their move properties', () => {
  const game = new Game(); game.start({ training: true, playerId: 'hanfeng' });
  assert.equal(game.fighters[0].id, 'hanfeng'); assert.equal(game.fighters[1].id, 'lieying');
  closeRange(game); game.attack(0, 'kick'); tick(game, .4);
  assert.equal(game.fighters[1].hp, 88);
});

test('combat events keep their event type separate from the move for audio feedback', () => {
  const events = [], game = new Game({ onEvent: event => events.push(event) });
  game.start({ training: true }); closeRange(game);
  game.attack(0, 'punch'); tick(game, .4);
  assert.ok(events.some(event => event.type === 'attack' && event.move === 'punch'));
  assert.ok(events.some(event => event.type === 'hit' && event.move === 'punch' && event.damage === 6));
});

test('a short press and release between simulation ticks still performs the action', () => {
  const game = training(); closeRange(game);
  game.setInput('punch', true); game.setInput('punch', false);
  tick(game, .3);
  assert.equal(game.fighters[1].hp, 94);
  tick(game, .2);
  game.setInput('jump', true); game.setInput('jump', false);
  tick(game, .15);
  assert.ok(game.fighters[0].y > 50);
});

test('the end of an attack accepts a buffered next move for responsive combos', () => {
  const game = training(); closeRange(game);
  game.setInput('punch', true); game.setInput('punch', false);
  tick(game, .3);
  assert.equal(game.fighters[0].attack.type, 'punch');
  game.setInput('kick', true); game.setInput('kick', false);
  tick(game, .4);
  assert.equal(game.matchStats.hits, 2);
  assert.equal(game.matchStats.maxCombo, 2);
});
