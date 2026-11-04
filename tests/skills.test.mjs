import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
const tick = (game, seconds) => { for (let t = 0; t < seconds; t += 1 / 120) game.update(1 / 120); };
const setup = playerId => { const game = new Game(); game.start({ training: true, playerId }); return game; };

test('both new close-range skills cost 35 energy and cannot be used without it', () => {
  for (const id of ['lieying', 'hanfeng']) {
    const game = setup(id), f = game.fighters[0];
    f.energy = 34; assert.equal(game.attack(0, 'skill'), false);
    f.energy = 35; assert.equal(game.attack(0, 'skill'), true); assert.equal(f.energy, 0);
    assert.equal(game.attack(0, 'skill'), false);
  }
});

test('flame dash closes distance, respects arena bodies, and connects exactly once', () => {
  const game = setup('lieying'), [a, b] = game.fighters;
  a.x = 650; b.x = 990;
  game.setInput('skill', true); game.setInput('skill', false);
  tick(game, .7);
  assert.ok(a.x > 730, 'the attack should move the fighter');
  assert.ok(a.x < b.x - 114, 'the dash must not pass through the target');
  assert.equal(game.trainingHits, 1);
  assert.equal(game.trainingDamage, 16);
});

test('frost uppercut launches on hit, while a guarded uppercut does not launch', () => {
  const game = setup('hanfeng'), [a, b] = game.fighters;
  a.x = 650; b.x = 805; game.attack(0, 'skill'); tick(game, .4);
  assert.ok(b.y > 15 || b.vy > 100);
  assert.equal(game.trainingHits, 1); assert.equal(game.trainingDamage, 20);
  const guard = setup('lieying'); guard.fighters[0].x = 650; guard.fighters[1].x = 805;
  guard.setInput('block', true); guard.attack(1, 'skill'); tick(guard, .45);
  assert.equal(guard.fighters[0].y, 0);
  assert.ok(guard.fighters[0].hp > 95);
});

test('the ranged skills have separate projectile appearances, speeds and hit reactions', () => {
  const flame = setup('lieying'), ice = setup('hanfeng');
  flame.attack(0, 'special'); ice.attack(0, 'special'); tick(flame, .3); tick(ice, .3);
  assert.equal(flame.projectiles[0].effect, 'flame'); assert.equal(ice.projectiles[0].effect, 'ice');
  assert.ok(ice.projectiles[0].speed > flame.projectiles[0].speed);
  tick(flame, .55); tick(ice, .55);
  assert.equal(flame.trainingHits, 1); assert.equal(ice.trainingHits, 1);
});
