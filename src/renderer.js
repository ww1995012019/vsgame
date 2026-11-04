import { WORLD, CHARACTERS, ATTACKS } from './engine.js';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.images = {};
    this.rainEnabled = true;
    this.shakeEnabled = true;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.rain = Array.from({ length: 86 }, () => ({ x: Math.random() * 1600, y: Math.random() * 760, speed: 450 + Math.random() * 500, length: 8 + Math.random() * 23, alpha: .06 + Math.random() * .13 }));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(bounds.width * this.dpr);
    this.canvas.height = Math.round(bounds.height * this.dpr);
  }

  async load() {
    await Promise.all(['lieying', 'hanfeng', 'arena'].map(id => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { this.images[id] = img; resolve(); };
      img.onerror = () => reject(new Error(`无法加载 ${id} 美术资源`));
      img.src = new URL(`../public/assets/${id}.png`, import.meta.url).href;
    })));
  }

  render(dt) {
    const ctx = this.ctx, game = this.game;
    if (!this.width || !this.height) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const [a, b] = game.fighters;
    const visibleWidth = this.width < 850 ? Math.max(880, Math.abs(a.x - b.x) + 590) : WORLD.width;
    const scale = Math.min(this.width / visibleWidth, this.height / WORLD.height);
    const cameraX = this.width < 850 ? (a.x + b.x) / 2 : WORLD.width / 2;
    const shake = this.shakeEnabled && !this.reducedMotion ? game.shake : 0;
    const floorRatio = this.width < 700 && this.height > this.width ? .74 : .91;
    ctx.translate(this.width / 2 - cameraX * scale + (Math.random() - .5) * shake * scale, this.height * floorRatio - WORLD.floor * scale + (Math.random() - .5) * shake * scale);
    ctx.scale(scale, scale);
    this.drawAmbient(ctx, dt);
    for (let i = 0; i < 2; i++) this.drawFighter(ctx, game.fighters[i], i);
    for (const p of game.projectiles) this.drawProjectile(ctx, p);
    this.drawParticles(ctx);
    if (game.state === 'playing') {
      for (const f of game.fighters) if (f.energy >= 50) this.drawAura(ctx, f);
    }
  }

  drawAmbient(ctx, dt) {
    if (!this.rainEnabled || this.reducedMotion) return;
    ctx.lineWidth = 1;
    const elapsed = this.game.paused ? 0 : dt;
    for (const drop of this.rain) {
      drop.y += drop.speed * elapsed;
      drop.x -= drop.speed * .17 * elapsed;
      if (drop.y > WORLD.height) { drop.y = -30; drop.x = Math.random() * WORLD.width; }
      if (drop.x < 0) drop.x += WORLD.width;
      ctx.strokeStyle = `rgba(176,229,230,${drop.alpha})`;
      ctx.beginPath(); ctx.moveTo(drop.x, drop.y); ctx.lineTo(drop.x - drop.length * .16, drop.y + drop.length); ctx.stroke();
    }
    for (let i = 0; i < 11; i++) {
      const progress = (this.game.elapsed * .55 + i * .277) % 1;
      ctx.strokeStyle = `rgba(149,221,220,${(1 - progress) * .12})`;
      ctx.beginPath(); ctx.ellipse((i * 197 + 78) % 1600, 662 + (i * 39) % 90, 3 + progress * 25, 1 + progress * 5, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  getFrame(f, index) {
    const g = this.game;
    if ((g.state === 'roundOver' || g.state === 'matchOver') && g.result) return g.result.winner === index ? 6 : g.result.winner === -1 ? 0 : 5;
    if (f.stun > 0 && !f.blocking) return 5;
    if (f.blocking) return 4;
    if (f.attack) return f.attack.time < .055 ? 0 : ATTACKS[f.attack.type].frame;
    if (f.y > 20) return 7;
    return 0;
  }

  drawFighter(ctx, f, index) {
    const image = this.images[f.id];
    if (!image) return;
    const size = f.id === 'lieying' ? 604 : 626;
    const frame = this.getFrame(f, index), sw = image.width / 4, sh = image.height / 2;
    const sx = frame % 4 * sw, sy = Math.floor(frame / 4) * sh;
    const phase = this.game.elapsed * (f.walking ? 15 : 3.8) + index * 2;
    const bob = this.reducedMotion ? 0 : Math.sin(phase) * (f.walking ? 7 : 2.2);
    const shadow = ctx.createRadialGradient(f.x, WORLD.floor + 2, 0, f.x, WORLD.floor + 2, 180);
    shadow.addColorStop(0, '#02090bc4'); shadow.addColorStop(1, '#02090b00');
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(f.x, WORLD.floor + 4, 180 - Math.min(f.y * .2, 80), 21, 0, 0, Math.PI * 2); ctx.fill();
    const draw = () => ctx.drawImage(image, sx + 1, sy + 1, sw - 2, sh - 2, -size / 2, -size * .974, size, size);
    // Reflections use the same independently animated sprite on the wet street.
    if (f.y <= 1) {
      ctx.save(); ctx.translate(f.x, WORLD.floor + 4); ctx.scale(f.facing, -.2); ctx.globalAlpha = .075; draw(); ctx.restore();
    }
    ctx.save();
    ctx.translate(f.x, WORLD.floor - f.y + (f.y > 0 ? 0 : bob));
    ctx.scale(f.facing, 1);
    if (f.walking && !this.reducedMotion && !f.attack && !f.stun) ctx.rotate(Math.sin(phase) * .009);
    if (f.hp <= 0 && this.game.result) {
      const progress = Math.min(1, this.game.result.age * 2);
      ctx.translate(0, -18 * progress);
      ctx.rotate(-progress * 1.28);
      ctx.globalAlpha = 1 - progress * .15;
    }
    if (f.hitFlash > .07) ctx.filter = 'brightness(1.75) saturate(.65)';
    draw();
    ctx.restore();
    if (f.attack && !this.reducedMotion) this.drawAttackTrail(ctx, f);
  }

  drawAttackTrail(ctx, f) {
    const a = f.attack, move = ATTACKS[a.type];
    if (a.time < move.active * .6 || a.time > move.end + .06) return;
    const progress = (a.time - move.active * .6) / (move.end + .06 - move.active * .6);
    const color = CHARACTERS[f.id].color;
    ctx.save(); ctx.translate(f.x, WORLD.floor - f.y - 330); ctx.scale(a.direction, 1); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.sin(progress * Math.PI) * .55;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 15;
    if (a.type === 'kick') {
      ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(36, 10, 238, 157, -.3, -1.4 + progress * .6, .15 + progress * .6); ctx.stroke();
      ctx.globalAlpha *= .6; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(35, 10, 250, 166, -.3, -1.5 + progress * .6, .25 + progress * .6); ctx.stroke();
    } else if (a.type === 'punch') {
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(60, -100); ctx.lineTo(190 + progress * 30, -105); ctx.stroke();
    }
    ctx.restore();
  }

  drawProjectile(ctx, p) {
    const color = CHARACTERS[this.game.fighters[p.owner].id].color;
    const y = WORLD.floor - p.y;
    ctx.save(); ctx.translate(p.x, y); ctx.scale(p.direction, 1); ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 95); glow.addColorStop(0, '#fff9dbdd'); glow.addColorStop(.2, color + 'b0'); glow.addColorStop(1, color + '00');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(-20, 0, 110, 75, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? '#fffbe6' : color; ctx.lineWidth = 3 + i; ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.globalAlpha = .8 - i * .12;
      ctx.beginPath(); ctx.ellipse(-i * 18, 0, 34 + i * 6, 48 + Math.sin(p.age * 22 + i) * 7, 0, -1.45, 1.45); ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of this.game.particles) {
      ctx.globalAlpha = Math.min(1, p.life / .15);
      ctx.strokeStyle = p.color; ctx.lineWidth = p.width;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .025, p.y - p.vy * .025); ctx.stroke();
    }
    ctx.restore();
  }

  drawAura(ctx, f) {
    if (this.reducedMotion) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = CHARACTERS[f.id].color; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const phase = (this.game.elapsed * .65 + i * .25) % 1;
      ctx.globalAlpha = (1 - phase) * .3;
      ctx.beginPath(); ctx.arc(f.x + Math.sin(i * 3) * 72, WORLD.floor - f.y - phase * 160, 1.5 + phase * 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

export class Sound {
  constructor() { this.volume = .45; this.muted = false; this.context = null; }
  unlock() {
    if (!this.context) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) this.context = new Audio(); }
    this.context?.resume().catch(() => {});
  }
  tone(frequency, duration, type = 'sine', gain = .15, endFrequency = frequency) {
    if (this.muted || !this.volume || !this.context || this.context.state !== 'running') return;
    const ctx = this.context, osc = ctx.createOscillator(), envelope = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), ctx.currentTime + duration);
    envelope.gain.setValueAtTime(Math.max(.0001, gain * this.volume), ctx.currentTime); envelope.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    osc.connect(envelope); envelope.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
  }
  play(event) {
    switch (event.type) {
      case 'attack': this.tone(event.move === 'kick' ? 140 : 190, .08, 'triangle', .1, 70); break;
      case 'hit': this.tone(110, .16, 'sawtooth', .11, 28); this.tone(450, .055, 'triangle', .1, 55); break;
      case 'block': this.tone(740, .1, 'square', .04, 260); break;
      case 'projectile': this.tone(110, .42, 'sawtooth', .06, 570); this.tone(520, .32, 'sine', .07, 180); break;
      case 'roundStart': this.tone(280, .5, 'sine', .12, 140); break;
      case 'fight': this.tone(440, .14, 'square', .04); this.tone(660, .35, 'triangle', .1); break;
      case 'roundEnd': this.tone(event.winner === 0 ? 523 : 180, .65, 'triangle', .1, event.winner === 0 ? 1046 : 65); break;
      case 'jump': this.tone(90, .13, 'triangle', .05, 270); break;
      case 'land': this.tone(60, .07, 'sine', .07, 25); break;
    }
  }
}
