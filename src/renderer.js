import { WORLD, CHARACTERS, attackFor } from './engine.js';
import { originalPoseFor, drawSkinBones } from './rig.js';
import { OriginalSkin, SKIN_SURFACE } from './skin.js';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.images = {};
    this.skins = {};
    this.rainEnabled = true;
    this.showBones = false;
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
    for (const id of ['lieying', 'hanfeng']) this.skins[id] = new OriginalSkin(this.images[id], id);
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

  drawFighter(ctx, f, index) {
    const skin = this.skins[f.id];
    if (!skin) return;
    const rig = skin.render(originalPoseFor(f, this.game.elapsed, index, this.game.result, this.reducedMotion));
    const draw = () => ctx.drawImage(skin.canvas, -SKIN_SURFACE.x, -SKIN_SURFACE.y);
    const shadow = ctx.createRadialGradient(f.x, WORLD.floor + 2, 0, f.x, WORLD.floor + 2, 140);
    shadow.addColorStop(0, '#02090bc4'); shadow.addColorStop(1, '#02090b00');
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(f.x, WORLD.floor + 4, 140 - Math.min(f.y * .2, 80), 18, 0, 0, Math.PI * 2); ctx.fill();
    if (f.y <= 1) {
      ctx.save(); ctx.translate(f.x, WORLD.floor + 4); ctx.scale(f.facing, -.16); ctx.globalAlpha = .10; draw(); ctx.restore();
    }
    if (f.attack?.type === 'skill' && !this.reducedMotion) this.drawSkillEffect(ctx, f, rig, true);
    ctx.save();
    ctx.translate(f.x, WORLD.floor - f.y);
    ctx.scale(f.facing, 1);
    if (f.hp <= 0 && this.game.result) {
      const progress = Math.min(1, this.game.result.age * 2);
      ctx.translate(0, -18 * progress); ctx.rotate(-progress * 1.28);
    }
    if (f.hitFlash > .07) ctx.globalAlpha = .65;
    draw();
    if (this.showBones) drawSkinBones(ctx, rig);
    ctx.restore();
    if (f.attack) {
      if (!this.reducedMotion) this.drawAttackTrail(ctx, f);
      if (['special', 'skill'].includes(f.attack.type)) this.drawSkillEffect(ctx, f, rig, false);
    }
  }

  drawSkillEffect(ctx, f, rig, behind) {
    const a = f.attack, move = attackFor(f.id, a.type), c = CHARACTERS[f.id];
    const windup = a.time / move.active, age = a.time - move.active;
    ctx.save(); ctx.translate(f.x, WORLD.floor - f.y); ctx.scale(a.direction, 1); ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = c.color; ctx.shadowBlur = 0;
    if (!behind && age < 0) {
      const hand = rig.effectHand, size = 12 + windup * 24;
      const glow = ctx.createRadialGradient(hand.x, hand.y, 1, hand.x, hand.y, size * 2);
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(.22, c.color + 'cc'); glow.addColorStop(1, c.color + '00');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(hand.x, hand.y, size * 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.color; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * .4 + a.time * 9;
        ctx.beginPath(); ctx.arc(hand.x, hand.y, size + 20, angle, angle + .36); ctx.stroke();
      }
    }
    if (move.effect === 'dash' && a.time > .1 && age < .30) {
      if (behind) {
        ctx.globalAlpha = .14;
        for (let i = 3; i >= 1; i--) { ctx.save(); ctx.translate(-i * 52, i * 2); ctx.drawImage(this.skins[f.id].canvas, -SKIN_SURFACE.x, -SKIN_SURFACE.y); ctx.restore(); }
        ctx.globalAlpha = .7; ctx.strokeStyle = '#ffb225';
        for (let i = 0; i < 8; i++) {
          const y = -65 - i * 49, offset = (a.time * 540 + i * 32) % 95;
          ctx.lineWidth = i % 3 + 1; ctx.beginPath(); ctx.moveTo(-190 - offset, y); ctx.lineTo(-60 + offset, y - 13); ctx.stroke();
        }
      } else {
        const hand = rig.effectHand;
        ctx.fillStyle = '#ff8b26aa';
        shapeFlame(ctx, hand.x, hand.y, 70, a.time);
        ctx.fillStyle = '#fff4c1'; shapeFlame(ctx, hand.x + 10, hand.y, 32, a.time);
      }
    }
    if (move.effect === 'uppercut' && age >= -.03 && age < .36) {
      const progress = Math.max(0, age / .36), alpha = Math.sin(Math.min(1, progress + .18) * Math.PI);
      ctx.globalAlpha = alpha * .85;
      ctx.strokeStyle = c.color; ctx.lineWidth = behind ? 15 : 4;
      ctx.beginPath(); ctx.ellipse(40, -312, 131 + progress * 18, 213, -.28, .2 - progress * 1.7, -2.65 - progress * .2, true); ctx.stroke();
      if (!behind) {
        ctx.strokeStyle = '#e1ffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(42, -315, 147, 225, -.28, -.25 - progress, -2.7, true); ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const angle = -Math.PI * .15 - i * .39 - progress * .6;
          const x = 40 + Math.cos(angle) * 143, y = -312 + Math.sin(angle) * 213;
          crystal(ctx, x, y, 11 + i % 3 * 5, angle, '#c9ffff', '#319fc6');
        }
      }
    }
    ctx.restore();
  }

  drawAttackTrail(ctx, f) {
    const a = f.attack, move = attackFor(f.id, a.type);
    if (a.time < move.active * .6 || a.time > move.end + .06) return;
    const progress = (a.time - move.active * .6) / (move.end + .06 - move.active * .6);
    const color = CHARACTERS[f.id].color;
    ctx.save(); ctx.translate(f.x, WORLD.floor - f.y - (a.type === 'punch' ? 420 : 330)); ctx.scale(a.direction, 1); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.sin(progress * Math.PI) * .55;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 15;
    if (a.type === 'kick') {
      ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(36, 10, 238, 157, -.3, -1.4 + progress * .6, .15 + progress * .6); ctx.stroke();
      ctx.globalAlpha *= .6; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(35, 10, 250, 166, -.3, -1.5 + progress * .6, .25 + progress * .6); ctx.stroke();
    } else if (a.type === 'punch') {
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(190 + progress * 30, -5); ctx.stroke();
    }
    ctx.restore();
  }

  drawProjectile(ctx, p) {
    const c = CHARACTERS[this.game.fighters[p.owner].id], y = WORLD.floor - p.y;
    ctx.save(); ctx.translate(p.x, y); ctx.scale(p.direction, 1); ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 115);
    glow.addColorStop(0, '#ffffffcc'); glow.addColorStop(.25, c.color + 'a0'); glow.addColorStop(1, c.color + '00');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(-25, 0, 155, 85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = c.color; ctx.shadowBlur = 18;
    if (p.effect === 'ice') {
      for (let i = 4; i >= 0; i--) {
        ctx.globalAlpha = .25 + (4 - i) * .16;
        crystal(ctx, -i * 26, Math.sin(p.age * 14 + i) * 17, 43 - i * 4, 0, '#eaffff', '#2684bd');
      }
      ctx.strokeStyle = '#91eafa'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const x = -50 - (p.age * 420 + i * 31) % 140, dy = Math.sin(i * 12) * 38; ctx.beginPath(); ctx.moveTo(x, dy); ctx.lineTo(x - 36, dy); ctx.stroke(); }
    } else {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#ff5a26a0' : '#ffc53bd0';
        shapeFlame(ctx, -i * 14, Math.sin(p.age * 22 + i) * 8, 68 - i * 5, p.age + i);
      }
      ctx.fillStyle = '#fff3bf'; shapeFlame(ctx, 15, 0, 35, p.age);
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
      case 'attack': this.tone(event.move === 'skill' ? 95 : event.move === 'kick' ? 140 : 190, event.move === 'skill' ? .28 : .08, 'triangle', .1, event.effect === 'uppercut' ? 670 : 70); break;
      case 'hit': this.tone(110, .16, 'sawtooth', .11, 28); this.tone(450, .055, 'triangle', .1, 55); break;
      case 'block': this.tone(740, .1, 'square', .04, 260); break;
      case 'projectile': this.tone(event.effect === 'ice' ? 880 : 110, .42, event.effect === 'ice' ? 'sine' : 'sawtooth', .06, 570); this.tone(520, .32, 'sine', .07, 180); break;
      case 'roundStart': this.tone(280, .5, 'sine', .12, 140); break;
      case 'fight': this.tone(440, .14, 'square', .04); this.tone(660, .35, 'triangle', .1); break;
      case 'roundEnd': this.tone(event.winner === 0 ? 523 : 180, .65, 'triangle', .1, event.winner === 0 ? 1046 : 65); break;
      case 'jump': this.tone(90, .13, 'triangle', .05, 270); break;
      case 'land': this.tone(60, .07, 'sine', .07, 25); break;
    }
  }
}

function shapeFlame(ctx, x, y, size, time) {
  const flicker = Math.sin(time * 36) * size * .13;
  ctx.beginPath(); ctx.moveTo(x + size, y);
  ctx.bezierCurveTo(x + size * .3, y - size, x - size, y - size * .35, x - size * 1.6, y - size * .55 + flicker);
  ctx.quadraticCurveTo(x - size * .8, y - size * .05, x - size * 2.2, y + size * .13);
  ctx.bezierCurveTo(x - size * .6, y + size * .25, x - size * .7, y + size * .9, x + size, y); ctx.fill();
}
function crystal(ctx, x, y, size, angle, light, dark) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(size * 1.5, 0); ctx.lineTo(-size * .2, -size * .65); ctx.lineTo(-size, 0); ctx.lineTo(-size * .2, size * .65); ctx.closePath(); ctx.fillStyle = dark; ctx.fill();
  ctx.beginPath(); ctx.moveTo(size * 1.5, 0); ctx.lineTo(-size * .2, -size * .65); ctx.lineTo(-size * .35, 0); ctx.closePath(); ctx.fillStyle = light; ctx.fill();
  ctx.strokeStyle = light; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
}
