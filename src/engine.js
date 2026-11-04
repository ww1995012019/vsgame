import { WALK, JUMP } from './motion.js';
import { COMBAT_FPS, COMBAT_RULES, framesAt, secondsAt, permits, setFighterState,
  moveData, movePhase, overlaps, overlapCenter, hurtboxesFor, hitboxesFor,
  pushboxFor, projectileBox, guardAllows, canCancel } from './combat.js';

export const WORLD = { width: 1600, height: 760, floor: 688, strikeHeight: 420 };
export const CHARACTERS = {
  lieying: { id: 'lieying', name: '烈影', subtitle: '赤焰疾风', color: '#ffca32', accent: '#ff572c', style: '速度型', speed: 320, forwardSpeed: 320, backSpeed: 250, maxHp: 100, jumpVelocity: JUMP.velocity, weight: 1, defense: 1, maxEnergy: 100, power: 1, description: '金焰破空，流火突进。以连续进攻撕开防线。', special: '赤焰掌', skill: '流火冲拳' },
  hanfeng: { id: 'hanfeng', name: '寒锋', subtitle: '霜刃无声', color: '#51deec', accent: '#558bff', style: '力量型', speed: 275, forwardSpeed: 275, backSpeed: 220, maxHp: 100, jumpVelocity: JUMP.velocity, weight: 1.1, defense: 1, maxEnergy: 100, power: 1.12, description: '冰棱远袭，霜环升龙。以寒气与重拳控制战局。', special: '冰棱破', skill: '霜环升龙' },
};
export const ATTACKS = {
  punch: moveData({ startupFrames: 6, activeFrames: 7, recoveryFrames: 6, hitStunFrames: 16, blockStunFrames: 8,
    damage: 6, reach: 345, knockback: 25, frame: 1, height: 'mid', air: true,
    // Source frame 1 puts the extended glove at x=232..243, y=-441..-451.
    hitboxes: [{ x: 140, y: -495, width: 145, height: 135 }],
    cancel: { fromFrame: 6, untilFrame: 16, into: ['kick', 'skill', 'special'] } }),
  kick: moveData({ startupFrames: 11, activeFrames: 9, recoveryFrames: 12, hitStunFrames: 24, blockStunFrames: 12,
    damage: 11, reach: 360, knockback: 68, frame: 2, height: 'high', air: false,
    // The raised shin and foot occupy x=145..260 in source frame 2.
    hitboxes: [{ x: 145, y: -500, width: 155, height: 135 }],
    cancel: { fromFrame: 11, untilFrame: 24, into: ['skill', 'special'] } }),
  special: moveData({ startupFrames: 14, activeFrames: 10, recoveryFrames: 21, hitStunFrames: 24, blockStunFrames: 14,
    damage: 21, reach: 285, knockback: 108, frame: 3, cost: 50, height: 'mid', hitboxes: [] }),
  skill: moveData({ startupFrames: 15, activeFrames: 12, recoveryFrames: 20, hitStunFrames: 24, blockStunFrames: 15,
    damage: 16, reach: 240, knockback: 85, frame: 1, cost: 35, height: 'mid',
    hitboxes: [{ x: 45, y: -465, width: 140, height: 150 }] }),
};
// Each character has its own mechanics as well as its own color and animation.
export const SKILLS = {
  lieying: {
    special: { ...ATTACKS.special, effect: 'flame', speed: 890, radius: 70 },
    skill: { ...ATTACKS.skill, effect: 'dash', dashSpeed: 780, dashStart: .10, dashEnd: .28, reach: 370,
      hitboxes: [{ x: 135, y: -500, width: 175, height: 165 }] },
  },
  hanfeng: {
    special: { ...ATTACKS.special, effect: 'ice', speed: 1050, radius: 62, stun: secondsAt(32), hitStunFrames: 32 },
    skill: { ...ATTACKS.skill, effect: 'uppercut', frame: 6, damage: 18, reach: 315, lift: 510, knockback: 45, height: 'high',
      // The front palm drives the visible frost arc; the raised rear fist stays behind the head.
      hitboxes: [{ x: 35, y: -535, width: 150, height: 275 }] },
  },
};
export const attackFor = (id, type) => SKILLS[id]?.[type] || ATTACKS[type];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const ACTIONS = ['jump', 'punch', 'kick', 'special', 'skill'];
const EMPTY = () => ({ left: false, right: false, jump: false, crouch: false, block: false, punch: false, kick: false, special: false, skill: false });

export class Game {
  constructor({ random = Math.random, onEvent = () => {}, roundSeconds = 99, bufferFrames = COMBAT_RULES.bufferFrames } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.difficulty = 'normal';
    this.training = false;
    this.playerId = 'lieying';
    this.roundSeconds = roundSeconds;
    this.bufferFrames = bufferFrames;
    this.state = 'ready';
    this.paused = false;
    this.round = 1;
    this.wins = [0, 0];
    this.elapsed = 0;
    this.input = EMPTY();
    this.events = [];
    this.resetRound();
  }

  emit(type, data = {}) { this.onEvent({ type, ...data }); }

  fighter(id, x, facing) {
    const data = CHARACTERS[id];
    return { id, x, y: 0, vy: 0, facing, hp: data.maxHp, energy: 30, maxHp: data.maxHp, maxEnergy: data.maxEnergy,
      state: 'Idle', stateTime: 0, stateFrame: 0, attack: null, stun: 0, stunKind: null,
      blocking: false, crouching: false, crouchBlend: 0, walking: false, move: 0, walkBlend: 0, stride: 0,
      jumpPhase: 'ground', jumpClock: 0, jumpVelocity: data.jumpVelocity, combo: 0, comboTimer: 0,
      hitFlash: 0, aiTimer: .9, invincible: 0, knockback: 0, launchRecovery: false, lastHit: null };
  }

  resetRound() {
    const other = this.playerId === 'lieying' ? 'hanfeng' : 'lieying';
    this.fighters = [this.fighter(this.playerId, 470, 1), this.fighter(other, 1130, -1)];
    this.timer = this.roundSeconds;
    this.projectiles = [];
    this.particles = [];
    this.hitStop = 0;
    this.shake = 0;
    this.comboDisplay = [0, 0];
    this.comboLife = [0, 0];
    this.result = null;
    this.input = EMPTY();
    this.bufferedActions = {};
    this.inputQueue = [];
    this.inputSequence = 0;
    this.logicFrame = 0;
    this.trainingDamage = 0;
    this.trainingHits = 0;
  }

  start({ training = this.training, playerId = this.playerId, roundSeconds = this.roundSeconds } = {}) {
    this.training = training;
    this.playerId = playerId;
    this.roundSeconds = roundSeconds;
    this.round = 1;
    this.wins = [0, 0];
    this.matchStats = { hits: 0, maxCombo: 0, damage: 0, started: Date.now() };
    this.resetRound();
    this.paused = false;
    this.state = training ? 'playing' : 'intro';
    this.introTime = training ? 0 : 2.4;
    if (training) this.fighters.forEach(f => f.energy = f.maxEnergy);
    this.emit(training ? 'training' : 'roundStart', { round: this.round });
  }

  nextRound() {
    if (this.state !== 'roundOver') return;
    this.round++;
    this.resetRound();
    this.state = 'intro';
    this.introTime = 2.4;
    this.emit('roundStart', { round: this.round });
  }

  setPaused(value) {
    this.paused = Boolean(value);
    this.clearInput();
  }

  setInput(action, pressed) {
    if (!(action in this.input)) return;
    // Keep a quick tap until the next simulation tick. A keydown + keyup can
    // both arrive between rendered frames, especially on touch keyboards.
    if (ACTIONS.includes(action)) {
      if (pressed) {
        this.input[action] = true;
        this.inputQueue.push({ action, frame: this.logicFrame, sequence: this.inputSequence++ });
      }
    } else this.input[action] = pressed;
  }

  clearInput() { this.input = EMPTY(); this.bufferedActions = {}; this.inputQueue = []; }

  syncFighterState(f) {
    if (['Victory', 'Defeat'].includes(f.state)) return;
    let next;
    if (f.hp <= 0) next = 'Defeat';
    else if (f.stun > 0) next = f.stunKind === 'block' ? 'Block' : f.launchRecovery ? 'Knockback' : 'Hit';
    else if (f.attack) next = f.attack.type === 'punch' ? 'LightAttack' : f.attack.type === 'kick' ? 'HeavyAttack' : 'SkillAttack';
    else if (f.jumpPhase === 'prepare') next = 'JumpStart';
    else if (f.jumpPhase === 'land') next = 'Landing';
    else if (f.jumpPhase === 'air' || f.y > 0) next = f.launchRecovery ? 'Knockback' : 'Jump';
    else if (f.blocking) next = 'Block';
    else if (f.crouching) next = 'Crouch';
    else if (f.walking && f.move) next = f.move * f.facing > 0 ? 'WalkForward' : 'WalkBackward';
    else next = 'Idle';
    setFighterState(f, next);
  }

  attack(index, type) {
    const f = this.fighters[index];
    const move = attackFor(f.id, type);
    this.syncFighterState(f);
    if (!move || this.state !== 'playing' || this.paused || f.stun > 0 || f.hp <= 0 || ['prepare', 'land'].includes(f.jumpPhase)) return false;
    if (f.attack ? !canCancel(f, type) : !permits(f, f.jumpPhase === 'air' ? 'airAttack' : 'attack')) return false;
    if (f.jumpPhase === 'air' && !move.air) return false;
    if (move.cost && f.energy < move.cost) {
      if (index === 0) this.emit('lowEnergy', { cost: move.cost });
      return false;
    }
    if (move.cost) f.energy -= move.cost;
    f.blocking = false;
    f.crouching = false;
    f.attack = { type, move, time: 0, connected: false, confirmedHit: false, launched: false,
      direction: f.facing, airborne: f.jumpPhase === 'air' };
    f.walking = false;
    this.syncFighterState(f);
    this.emit('attack', { index, move: type, character: f.id, effect: move.effect });
    return true;
  }

  jump(index) {
    const f = this.fighters[index];
    this.syncFighterState(f);
    if (this.state !== 'playing' || this.paused || f.y > .1 || f.stun > 0 || f.attack || f.jumpPhase !== 'ground' || !permits(f, 'jump')) return false;
    f.jumpPhase = 'prepare';
    f.jumpClock = 0;
    f.vy = 0;
    f.blocking = false;
    f.crouching = false;
    this.syncFighterState(f);
    return true;
  }

  update(dt) {
    dt = clamp(dt, 0, .04);
    if (this.paused) return;
    this.elapsed += dt;
    this.updateEffects(dt);
    if (this.state === 'intro') {
      this.introTime -= dt;
      if (this.introTime <= 0) { this.state = 'playing'; this.emit('fight'); }
      return;
    }
    if (this.state === 'roundOver' || this.state === 'matchOver') {
      this.result.age += dt;
      return;
    }
    if (this.state !== 'playing') return;
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this.logicFrame += dt * COMBAT_FPS;

    if (!this.training) {
      this.timer = Math.max(0, this.timer - dt);
      if (!this.timer) { this.finishRound('timeout'); return; }
    }
    this.controlPlayer(dt);
    this.controlAI(dt);
    for (let i = 0; i < 2; i++) this.updateFighter(i, dt);
    this.resolveBodies();
    // Capture both fighters' valid contacts before any damage interrupts them.
    // Applying hits inside updateFighter would give fighter zero permanent priority.
    const contacts = this.collectMeleeHits();
    this.updateProjectiles(dt, contacts);
    for (const contact of contacts) this.hit(contact.index, contact.type, contact.x, contact.y, contact.direction, contact);
    for (const f of this.fighters) {
      if (f.attack && movePhase(f.attack.move, f.attack.time) === 'ended') {
        if (!f.attack.connected && f.attack.type !== 'special') f.lastHit = { result: 'miss', move: f.attack.type, frame: framesAt(f.attack.time), at: this.elapsed };
        f.attack = null;
      }
      this.syncFighterState(f);
    }
    if (this.training) {
      this.fighters.forEach(f => { f.energy = Math.min(f.maxEnergy, f.energy + dt * 35); });
      if (this.fighters[1].hp <= 0) {
        const f = this.fighters[1];
        f.hp = f.maxHp;
        f.stun = .7;
        f.stunKind = 'hit';
        setFighterState(f, 'Hit');
        this.emit('trainingReset');
      }
    } else if (this.fighters.some(f => f.hp <= 0)) this.finishRound('ko');
  }

  controlPlayer(dt) {
    const f = this.fighters[0], other = this.fighters[1];
    if (!f.attack && f.jumpPhase !== 'air') f.facing = other.x >= f.x ? 1 : -1;
    this.syncFighterState(f);
    const direction = this.input.left === this.input.right ? 0 : this.input.right ? 1 : -1;
    const grounded = f.y === 0 && f.jumpPhase === 'ground';
    const guarding = grounded && !f.attack && permits(f, 'guard') && (f.stun <= 0 || f.stunKind === 'block');
    f.crouching = Boolean(grounded && this.input.crouch && !f.attack && permits(f, 'guard'));
    const incoming = Boolean(other.attack && Math.abs(other.x - f.x) < Math.max(310, other.attack.move.reach + 80))
      || this.projectiles.some(p => p.owner !== 0 && (f.x - p.x) * p.direction >= 0 && Math.abs(p.x - f.x) < 360);
    f.blocking = Boolean(guarding && (f.stunKind === 'block' || this.input.block || direction * f.facing < 0 && incoming));
    const movable = permits(f, 'move') || grounded && ['Crouch', 'Block'].includes(f.state);
    f.walking = Boolean(!f.blocking && !f.crouching && f.stun <= 0 && !f.attack && movable && direction);
    f.move = f.walking ? direction : 0;
    this.syncFighterState(f);
    for (const action of ACTIONS) this.input[action] = false;
    this.inputQueue = this.inputQueue.filter(entry => this.logicFrame - entry.frame <= this.bufferFrames + 1e-7);
    for (let i = 0; i < this.inputQueue.length; i++) {
      const entry = this.inputQueue[i];
      const performed = entry.action === 'jump' ? this.jump(0) : this.attack(0, entry.action);
      if (performed) { this.inputQueue.splice(i, 1); break; }
      if (entry.action !== 'jump' && f.energy < (attackFor(f.id, entry.action).cost || 0)) {
        this.inputQueue.splice(i--, 1);
      }
    }
    this.bufferedActions = Object.fromEntries(this.inputQueue.map(entry => [entry.action, secondsAt(this.bufferFrames - this.logicFrame + entry.frame)]));
  }

  controlAI(dt) {
    const f = this.fighters[1], player = this.fighters[0];
    f.move = 0;
    f.walking = false;
    if (!f.attack && f.jumpPhase !== 'air') f.facing = player.x >= f.x ? 1 : -1;
    this.syncFighterState(f);
    if (this.training) { f.blocking = false; f.crouching = false; return; }
    if (f.stun > 0 || f.attack || !permits(f, 'move') && f.state !== 'Block') return;
    const settings = { easy: { reaction: .62, guard: .18, speed: .68 }, normal: { reaction: .36, guard: .42, speed: .84 }, hard: { reaction: .19, guard: .68, speed: 1 } }[this.difficulty];
    const distance = Math.abs(f.x - player.x);
    f.aiTimer -= dt;
    if (f.aiTimer <= 0) {
      f.aiTimer = settings.reaction + this.random() * .3;
      f.blocking = f.y === 0 && f.jumpPhase === 'ground' && (player.attack && distance < 310 ? this.random() < settings.guard : this.random() < .1);
      if (!f.blocking && distance < 280 && this.random() > .12) {
        const pick = this.random();
        this.attack(1, f.energy >= 50 && pick > .82 ? 'special' : f.energy >= 35 && pick > .64 ? 'skill' : distance > 190 || pick > .47 ? 'kick' : 'punch');
      } else if (f.energy >= 50 && distance < 680 && this.random() < .2) this.attack(1, 'special');
      if (player.attack?.type === 'special' && this.random() < .2) this.jump(1);
    }
    if (!f.blocking && !f.attack && distance > 180) {
      f.move = Math.sign(player.x - f.x) * settings.speed;
      f.walking = true;
    }
    this.syncFighterState(f);
  }

  updateFighter(index, dt) {
    const f = this.fighters[index], other = this.fighters[1 - index];
    f.stateTime += dt;
    f.stateFrame = framesAt(f.stateTime);
    const crouchTarget = f.crouching && f.y === 0 ? 1 : 0;
    f.crouchBlend += clamp(crouchTarget - f.crouchBlend, -dt / .10, dt / .10);
    f.hitFlash = Math.max(0, f.hitFlash - dt);
    f.stun = Math.max(0, f.stun - dt);
    f.invincible = Math.max(0, f.invincible - dt);
    // Fractional host samples must not leave an extra locked frame of residue.
    if (f.stun < 1e-7) f.stun = 0;
    if (f.invincible < 1e-7) f.invincible = 0;
    if (f.stun <= 0) {
      f.stunKind = null;
      // A true combo ends as soon as its victim can act again.
      if (!f.launchRecovery) this.endCombo(1 - index);
    }
    this.comboLife[index] = Math.max(0, this.comboLife[index] - dt);
    if (!f.attack && f.jumpPhase !== 'air') f.facing = other.x >= f.x ? 1 : -1;
    f.jumpClock += dt;
    if (f.jumpPhase === 'prepare') {
      if (f.stun > 0) { f.jumpPhase = 'ground'; f.jumpClock = 0; }
      else if (f.jumpClock >= JUMP.prepare) {
        f.jumpPhase = 'air'; f.jumpClock = 0; f.vy = CHARACTERS[f.id].jumpVelocity; f.jumpVelocity = f.vy;
        this.emit('jump', { index });
      }
    } else if (f.jumpPhase === 'land' && f.jumpClock >= JUMP.land) {
      f.jumpPhase = 'ground'; f.jumpClock = 0;
      if (f.launchRecovery) { f.launchRecovery = false; this.endCombo(1 - index); }
    }
    if (f.y > 0 || f.vy > 0) {
      if (f.jumpPhase !== 'air') { f.jumpPhase = 'air'; f.jumpClock = 0; f.jumpVelocity = Math.max(f.vy, JUMP.velocity); }
      f.y += f.vy * dt;
      f.vy -= JUMP.gravity * dt;
      if (f.y <= 0) {
        f.y = 0; f.vy = 0; f.jumpPhase = 'land'; f.jumpClock = 0;
        // Air attacks finish at touchdown; landing remains a locked phase.
        f.attack = null;
        if (f.launchRecovery) {
          f.stun = 0; f.stunKind = null; f.knockback = 0;
        }
        this.emit('land', { index });
      }
    }
    const beforeMove = f.x;
    this.syncFighterState(f);
    if (f.stun <= 0 && !f.attack && !f.blocking && permits(f, 'move')) {
      const data = CHARACTERS[f.id];
      const speed = f.move * f.facing >= 0 ? data.forwardSpeed : data.backSpeed;
      const travel = (f.move || 0) * speed * dt;
      f.x = clamp(f.x + travel, COMBAT_RULES.arenaMargin, WORLD.width - COMBAT_RULES.arenaMargin);
      if (f.y === 0) f.stride += (f.x - beforeMove) * f.facing / WALK.stride * Math.PI * 2;
    }
    const walkTarget = f.y === 0 && f.jumpPhase === 'ground' && Math.abs(f.x - beforeMove) > .001 && f.walking ? 1 : 0;
    f.walkBlend += Math.max(-dt / WALK.blendTime, Math.min(dt / WALK.blendTime, walkTarget - f.walkBlend));
    f.x += f.knockback * dt;
    f.knockback *= Math.exp(-11 * dt);
    f.x = clamp(f.x, COMBAT_RULES.arenaMargin, WORLD.width - COMBAT_RULES.arenaMargin);
    f.energy = Math.min(f.maxEnergy, f.energy + dt * 1.8);
    if (!f.attack) return;
    const a = f.attack, move = a.move;
    a.time += dt;
    if (move.dashSpeed && a.time >= move.dashStart && a.time <= move.dashEnd) {
      // Stop at body contact; a dash must never tunnel through its target.
      const ahead = (other.x - f.x) * a.direction;
      f.x += a.direction * Math.min(move.dashSpeed * dt, Math.max(0, ahead - 125));
      f.x = clamp(f.x, COMBAT_RULES.arenaMargin, WORLD.width - COMBAT_RULES.arenaMargin);
    }
    if (a.type === 'special' && framesAt(a.time) >= move.startupFrames && !a.launched) {
      a.launched = true;
      const muzzle = Math.min(225, Math.max(40, (other.x - f.x) * a.direction - 35));
      this.projectiles.push({ owner: index, x: f.x + a.direction * muzzle, y: f.y + WORLD.strikeHeight, direction: a.direction, life: 1.5, hit: false, age: 0, effect: move.effect, speed: move.speed, radius: move.radius, move });
      this.emit('projectile', { index, effect: move.effect });
    }
  }

  resolveBodies() {
    const [a, b] = this.fighters;
    const dx = b.x - a.x;
    if (overlaps(pushboxFor(a, WORLD.floor), pushboxFor(b, WORLD.floor))) {
      const direction = dx >= 0 ? 1 : -1, gap = COMBAT_RULES.pushWidth;
      const left = direction === 1 ? a : b, right = direction === 1 ? b : a;
      const min = COMBAT_RULES.arenaMargin, max = WORLD.width - min;
      const overlap = gap - (right.x - left.x);
      const leftMove = Math.min(overlap / 2, left.x - min);
      const rightMove = Math.min(overlap - leftMove, max - right.x);
      left.x -= Math.min(overlap - rightMove, left.x - min);
      right.x += rightMove;
    }
  }

  collectMeleeHits() {
    const contacts = [];
    for (let index = 0; index < this.fighters.length; index++) {
      const f = this.fighters[index], target = this.fighters[1 - index], a = f.attack;
      if (!a || a.connected || target.invincible > 0 || target.hp <= 0) continue;
      const hurtboxes = hurtboxesFor(target, WORLD.floor);
      for (const hitbox of hitboxesFor(f, a.move, WORLD.floor)) {
        const hurtbox = hurtboxes.find(box => overlaps(hitbox, box));
        if (!hurtbox) continue;
        a.connected = true;
        contacts.push({ index, type: a.type, move: a.move, attack: a, direction: a.direction,
          ...overlapCenter(hitbox, hurtbox), blocked: guardAllows(target, a.move, a.direction),
          continuation: target.stun > 0 && target.stunKind !== 'block' || target.launchRecovery });
        break;
      }
    }
    return contacts;
  }

  updateProjectiles(dt, contacts = null) {
    const pending = contacts || [];
    for (const p of this.projectiles) {
      p.age += dt;
      p.life -= dt;
      const previousX = p.x;
      p.x += p.direction * (p.speed || 890) * dt;
      const target = this.fighters[1 - p.owner];
      const hitbox = projectileBox(p, WORLD.floor, previousX);
      const hurtbox = hurtboxesFor(target, WORLD.floor).find(box => overlaps(hitbox, box));
      if (!p.hit && p.life > 0 && target.hp > 0 && target.invincible <= 0 && hurtbox) {
        p.hit = true;
        const move = p.move || attackFor(this.fighters[p.owner].id, 'special');
        pending.push({ index: p.owner, type: 'special', move, direction: p.direction,
          ...overlapCenter(hitbox, hurtbox), blocked: guardAllows(target, move, p.direction),
          continuation: target.stun > 0 && target.stunKind !== 'block' || target.launchRecovery });
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && !p.hit && p.x > -100 && p.x < WORLD.width + 100);
    if (!contacts) for (const contact of pending) this.hit(contact.index, contact.type, contact.x, contact.y, contact.direction, contact);
  }

  hit(index, type, x, y, direction, contact = {}) {
    const attacker = this.fighters[index], target = this.fighters[1 - index];
    if (target.invincible > 0 || target.hp <= 0) return;
    const move = contact.move || attackFor(attacker.id, type);
    const blocked = contact.blocked ?? guardAllows(target, move, direction);
    const continuation = contact.continuation ?? (target.stun > 0 && target.stunKind !== 'block' || target.launchRecovery);
    const damage = Math.round(move.damage * CHARACTERS[attacker.id].power / CHARACTERS[target.id].defense * (blocked ? .16 : 1));
    target.hp = Math.max(0, target.hp - damage);
    target.stun = blocked ? move.blockStun : move.stun;
    target.stunKind = blocked ? 'block' : 'hit';
    target.hitFlash = blocked ? .06 : .14;
    target.knockback = direction * move.knockback * (blocked ? 2 : 8) / CHARACTERS[target.id].weight;
    if (!blocked && move.lift) {
      target.vy = move.lift / CHARACTERS[target.id].weight;
      target.launchRecovery = true;
    }
    if (!blocked) { target.attack = null; target.blocking = false; }
    target.energy = Math.min(target.maxEnergy, target.energy + (blocked ? 5 : 8));
    attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + (move.cost ? 0 : blocked ? 3 : 10));
    this.hitStop = Math.max(this.hitStop, blocked ? .025 : move.cost ? .09 : .055);
    this.shake = Math.max(this.shake, blocked ? 2 : move.cost ? 12 : type === 'kick' ? 7 : 4);
    if (contact.attack) contact.attack.confirmedHit = !blocked;
    attacker.lastHit = { result: blocked ? 'block' : 'hit', move: type, damage, frame: framesAt(contact.attack?.time || 0), at: this.elapsed };
    target.lastHit = { result: blocked ? 'guarded' : 'received', move: type, damage, frame: target.stateFrame, at: this.elapsed };
    if (!blocked) {
      attacker.combo = continuation ? attacker.combo + 1 : 1;
      attacker.comboTimer = 1.35;
      this.comboDisplay[index] = attacker.combo;
      this.comboLife[index] = 1.35;
      if (index === 0) {
        this.matchStats.hits++;
        this.matchStats.damage += damage;
        this.matchStats.maxCombo = Math.max(this.matchStats.maxCombo, attacker.combo);
        this.trainingHits++;
        this.trainingDamage += damage;
      }
    }
    this.syncFighterState(target);
    const color = blocked ? '#a2eaff' : CHARACTERS[attacker.id].color;
    const count = blocked ? 11 : move.cost ? 45 : 26;
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2, speed = 140 + this.random() * 700;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .18 + this.random() * .32, maxLife: .5, color, width: 1 + this.random() * 3 });
    }
    this.emit(blocked ? 'block' : 'hit', { index, move: type, effect: move.effect, damage, combo: attacker.combo, x, y });
  }

  endCombo(index) {
    this.fighters[index].combo = 0;
    this.comboDisplay[index] = 0;
    this.comboLife[index] = 0;
  }

  getDebugSnapshot() {
    return {
      frame: Math.floor(this.logicFrame), fps: COMBAT_FPS,
      fighters: this.fighters.map((f, index) => {
        const move = f.attack?.move, moveFrame = f.attack ? framesAt(f.attack.time) : 0;
        return { index, id: f.id, state: f.state, stateFrame: f.stateFrame,
          move: f.attack?.type || null, moveFrame,
          activePhase: move ? movePhase(move, f.attack.time) : null,
          remainingFrame: move ? Math.max(0, move.startupFrames + move.activeFrames + move.recoveryFrames - moveFrame) : 0,
          pushbox: pushboxFor(f, WORLD.floor), hurtboxes: hurtboxesFor(f, WORLD.floor),
          hitboxes: move ? hitboxesFor(f, move, WORLD.floor) : [], lastHit: f.lastHit ? { ...f.lastHit } : null };
      }),
      projectileHitboxes: this.projectiles.map(p => ({ ...projectileBox(p, WORLD.floor), owner: p.owner })),
    };
  }

  updateEffects(dt) {
    this.shake *= Math.exp(-17 * dt);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 650 * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  finishRound(reason) {
    if (this.state !== 'playing') return;
    const [a, b] = this.fighters;
    const winner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
    if (winner !== -1) this.wins[winner]++;
    const finished = this.wins.some(n => n >= 2);
    this.result = { winner, reason, age: 0, finished };
    this.state = finished ? 'matchOver' : 'roundOver';
    this.clearInput();
    this.fighters.forEach((f, i) => {
      f.attack = null; f.blocking = false; f.walking = false;
      setFighterState(f, winner === -1 ? 'Idle' : winner === i ? 'Victory' : 'Defeat');
    });
    this.projectiles = [];
    this.emit('roundEnd', { ...this.result, wins: [...this.wins], stats: { ...this.matchStats }, playerId: this.playerId });
  }
}
