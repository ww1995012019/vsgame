export const WORLD = { width: 1600, height: 760, floor: 688, strikeHeight: 420 };
export const CHARACTERS = {
  lieying: { id: 'lieying', name: '烈影', subtitle: '赤焰疾风', color: '#ffca32', accent: '#ff572c', style: '速度型', speed: 320, power: 1, description: '金焰破空，流火突进。以连续进攻撕开防线。', special: '赤焰掌', skill: '流火冲拳' },
  hanfeng: { id: 'hanfeng', name: '寒锋', subtitle: '霜刃无声', color: '#51deec', accent: '#558bff', style: '力量型', speed: 275, power: 1.12, description: '冰棱远袭，霜环升龙。以寒气与重拳控制战局。', special: '冰棱破', skill: '霜环升龙' },
};
export const ATTACKS = {
  punch: { duration: .31, active: .09, end: .2, damage: 6, reach: 194, knockback: 25, stun: .16, frame: 1 },
  kick: { duration: .53, active: .18, end: .32, damage: 11, reach: 264, knockback: 68, stun: .26, frame: 2 },
  special: { duration: .75, active: .23, end: .4, damage: 21, reach: 285, knockback: 108, stun: .38, frame: 3, cost: 50 },
  skill: { duration: .78, active: .24, end: .43, damage: 16, reach: 240, knockback: 85, stun: .34, cost: 35 },
};
// Each character has its own mechanics as well as its own color and animation.
export const SKILLS = {
  lieying: {
    special: { ...ATTACKS.special, effect: 'flame', speed: 890, radius: 70 },
    skill: { ...ATTACKS.skill, effect: 'dash', dashSpeed: 780, dashStart: .10, dashEnd: .28 },
  },
  hanfeng: {
    special: { ...ATTACKS.special, effect: 'ice', speed: 1050, radius: 62, stun: .52 },
    skill: { ...ATTACKS.skill, effect: 'uppercut', damage: 18, reach: 230, lift: 510, knockback: 45 },
  },
};
export const attackFor = (id, type) => SKILLS[id]?.[type] || ATTACKS[type];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const EMPTY = () => ({ left: false, right: false, jump: false, block: false, punch: false, kick: false, special: false, skill: false });

export class Game {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.difficulty = 'normal';
    this.training = false;
    this.playerId = 'lieying';
    this.roundSeconds = 90;
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
    return { id, x, y: 0, vy: 0, facing, hp: 100, energy: 30, attack: null, stun: 0, blocking: false, walking: false, walkBlend: 0, stride: 0, combo: 0, comboTimer: 0, hitFlash: 0, aiTimer: .9, invincible: 0, knockback: 0 };
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
    this.trainingDamage = 0;
    this.trainingHits = 0;
  }

  start({ training = this.training, playerId = this.playerId } = {}) {
    this.training = training;
    this.playerId = playerId;
    this.round = 1;
    this.wins = [0, 0];
    this.matchStats = { hits: 0, maxCombo: 0, damage: 0, started: Date.now() };
    this.resetRound();
    this.paused = false;
    this.state = training ? 'playing' : 'intro';
    this.introTime = training ? 0 : 2.4;
    if (training) this.fighters.forEach(f => f.energy = 100);
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
    if (['jump', 'punch', 'kick', 'special', 'skill'].includes(action)) {
      if (pressed) this.input[action] = true;
    } else this.input[action] = pressed;
  }

  clearInput() { this.input = EMPTY(); this.bufferedActions = {}; }

  attack(index, type) {
    const f = this.fighters[index];
    const move = attackFor(f.id, type);
    if (!move || this.state !== 'playing' || this.paused || f.attack || f.stun > 0 || f.hp <= 0) return false;
    if (move.cost && f.energy < move.cost) {
      if (index === 0) this.emit('lowEnergy', { cost: move.cost });
      return false;
    }
    if (move.cost) f.energy -= move.cost;
    f.blocking = false;
    f.attack = { type, time: 0, connected: false, launched: false, direction: f.facing };
    this.emit('attack', { index, move: type, character: f.id, effect: move.effect });
    return true;
  }

  jump(index) {
    const f = this.fighters[index];
    if (this.state !== 'playing' || this.paused || f.y > .1 || f.stun > 0 || f.attack) return false;
    f.vy = 790;
    f.blocking = false;
    this.emit('jump', { index });
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

    if (!this.training) {
      this.timer = Math.max(0, this.timer - dt);
      if (!this.timer) { this.finishRound('timeout'); return; }
    }
    this.controlPlayer(dt);
    this.controlAI(dt);
    for (let i = 0; i < 2; i++) this.updateFighter(i, dt);
    this.resolveBodies();
    this.updateProjectiles(dt);
    if (this.training) {
      this.fighters.forEach(f => { f.energy = Math.min(100, f.energy + dt * 35); });
      if (this.fighters[1].hp <= 0) {
        this.fighters[1].hp = 100;
        this.fighters[1].stun = .7;
        this.emit('trainingReset');
      }
    } else if (this.fighters.some(f => f.hp <= 0)) this.finishRound('ko');
  }

  controlPlayer(dt) {
    const f = this.fighters[0];
    f.blocking = Boolean(this.input.block && f.y === 0 && !f.attack && f.stun <= 0);
    f.walking = !f.blocking && !f.attack && f.stun <= 0 && this.input.left !== this.input.right;
    f.move = f.walking ? (this.input.right ? 1 : -1) : 0;
    for (const action of ['jump', 'special', 'skill', 'kick', 'punch']) {
      if (this.input[action]) { this.bufferedActions[action] = .16; this.input[action] = false; }
    }
    if (this.bufferedActions.jump > 0 && this.jump(0)) delete this.bufferedActions.jump;
    for (const type of ['special', 'skill', 'kick', 'punch']) {
      if (this.bufferedActions[type] > 0) {
        const performed = this.attack(0, type);
        if (performed || f.energy < (attackFor(f.id, type).cost || 0)) delete this.bufferedActions[type];
      }
    }
    for (const type of Object.keys(this.bufferedActions)) {
      this.bufferedActions[type] -= dt;
      if (this.bufferedActions[type] <= 0) delete this.bufferedActions[type];
    }
  }

  controlAI(dt) {
    const f = this.fighters[1], player = this.fighters[0];
    f.move = 0;
    f.walking = false;
    if (this.training) { f.blocking = false; return; }
    if (f.stun > 0 || f.attack) return;
    const settings = { easy: { reaction: .62, guard: .18, speed: .68 }, normal: { reaction: .36, guard: .42, speed: .84 }, hard: { reaction: .19, guard: .68, speed: 1 } }[this.difficulty];
    const distance = Math.abs(f.x - player.x);
    f.aiTimer -= dt;
    if (f.aiTimer <= 0) {
      f.aiTimer = settings.reaction + this.random() * .3;
      f.blocking = player.attack && distance < 310 ? this.random() < settings.guard : this.random() < .1;
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
  }

  updateFighter(index, dt) {
    const f = this.fighters[index], other = this.fighters[1 - index];
    f.walkBlend += Math.max(-dt * 8, Math.min(dt * 8, (f.walking && !f.attack && !f.stun ? 1 : 0) - f.walkBlend));
    f.hitFlash = Math.max(0, f.hitFlash - dt);
    f.stun = Math.max(0, f.stun - dt);
    f.invincible = Math.max(0, f.invincible - dt);
    f.comboTimer -= dt;
    if (f.comboTimer <= 0) f.combo = 0;
    this.comboLife[index] = Math.max(0, this.comboLife[index] - dt);
    if (!f.attack) f.facing = other.x >= f.x ? 1 : -1;
    if (f.y > 0 || f.vy > 0) {
      f.y += f.vy * dt;
      f.vy -= 2100 * dt;
      if (f.y <= 0) { f.y = 0; f.vy = 0; this.emit('land', { index }); }
    }
    if (f.stun <= 0 && !f.attack && !f.blocking) {
      const travel = (f.move || 0) * CHARACTERS[f.id].speed * dt;
      f.x += travel;
      f.stride += Math.abs(travel) / 94 * Math.PI * 2;
    }
    f.x += f.knockback * dt;
    f.knockback *= Math.exp(-11 * dt);
    f.x = clamp(f.x, 175, WORLD.width - 175);
    f.energy = Math.min(100, f.energy + dt * 1.8);
    if (!f.attack) return;
    const a = f.attack, move = attackFor(f.id, a.type);
    a.time += dt;
    if (move.dashSpeed && a.time >= move.dashStart && a.time <= move.dashEnd) {
      // Stop at body contact; a dash must never tunnel through its target.
      const ahead = (other.x - f.x) * a.direction;
      f.x += a.direction * Math.min(move.dashSpeed * dt, Math.max(0, ahead - 125));
      f.x = clamp(f.x, 175, WORLD.width - 175);
    }
    if (a.type === 'special' && a.time >= move.active && !a.launched) {
      a.launched = true;
      const muzzle = Math.min(225, Math.max(40, (other.x - f.x) * a.direction - 35));
      this.projectiles.push({ owner: index, x: f.x + a.direction * muzzle, y: f.y + WORLD.strikeHeight, direction: a.direction, life: 1.5, hit: false, age: 0, effect: move.effect, speed: move.speed, radius: move.radius });
      this.emit('projectile', { index, effect: move.effect });
    } else if (a.type !== 'special' && !a.connected && a.time >= move.active && a.time <= move.end) {
      const ahead = (other.x - f.x) * a.direction;
      if (ahead > 0 && ahead < move.reach && Math.abs(f.y - other.y) < 175) {
        a.connected = true;
        this.hit(index, a.type, other.x - a.direction * 45, WORLD.floor - other.y - WORLD.strikeHeight, a.direction);
      }
    }
    if (a.time >= move.duration) f.attack = null;
  }

  resolveBodies() {
    const [a, b] = this.fighters;
    const dx = b.x - a.x;
    if (Math.abs(dx) < 115 && Math.abs(a.y - b.y) < 230) {
      const push = (115 - Math.abs(dx)) * .5, direction = dx >= 0 ? 1 : -1;
      a.x = clamp(a.x - push * direction, 175, WORLD.width - 175);
      b.x = clamp(b.x + push * direction, 175, WORLD.width - 175);
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.age += dt;
      p.life -= dt;
      p.x += p.direction * (p.speed || 890) * dt;
      const target = this.fighters[1 - p.owner];
      if (!p.hit && Math.abs(p.x - target.x) < (p.radius || 70) + 15 && Math.abs(p.y - (target.y + WORLD.strikeHeight)) < 155) {
        p.hit = true;
        this.hit(p.owner, 'special', target.x, WORLD.floor - p.y, p.direction);
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && !p.hit && p.x > -100 && p.x < WORLD.width + 100);
  }

  hit(index, type, x, y, direction) {
    const attacker = this.fighters[index], target = this.fighters[1 - index];
    if (target.invincible > 0 || target.hp <= 0) return;
    const move = attackFor(attacker.id, type);
    const blocked = target.blocking && target.y === 0 && target.facing === -direction;
    const damage = Math.round(move.damage * CHARACTERS[attacker.id].power * (blocked ? .16 : 1));
    target.hp = Math.max(0, target.hp - damage);
    target.stun = blocked ? .1 : move.stun;
    target.hitFlash = blocked ? .06 : .14;
    target.knockback = direction * move.knockback * (blocked ? 2 : 8);
    if (!blocked && move.lift) target.vy = move.lift;
    if (!blocked) { target.attack = null; target.blocking = false; }
    target.energy = Math.min(100, target.energy + (blocked ? 5 : 8));
    attacker.energy = Math.min(100, attacker.energy + (move.cost ? 0 : blocked ? 3 : 10));
    this.hitStop = blocked ? .025 : move.cost ? .09 : .055;
    this.shake = blocked ? 2 : move.cost ? 12 : type === 'kick' ? 7 : 4;
    if (!blocked) {
      attacker.combo++;
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
    const color = blocked ? '#a2eaff' : CHARACTERS[attacker.id].color;
    const count = blocked ? 11 : move.cost ? 45 : 26;
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2, speed = 140 + this.random() * 700;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .18 + this.random() * .32, maxLife: .5, color, width: 1 + this.random() * 3 });
    }
    this.emit(blocked ? 'block' : 'hit', { index, move: type, effect: move.effect, damage, combo: attacker.combo, x, y });
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
    this.fighters.forEach(f => { f.attack = null; f.blocking = false; f.walking = false; });
    this.projectiles = [];
    this.emit('roundEnd', { ...this.result, wins: [...this.wins], stats: { ...this.matchStats }, playerId: this.playerId });
  }
}
