// Combat uses 60 Hz frame data even when the host samples physics more often.
// Geometry is deliberately independent of the rendered sprite and skeleton.
export const COMBAT_FPS = 60;
export const COMBAT_RULES = {
  bufferFrames: 8, arenaMargin: 175, pushWidth: 115, pushHeight: 90,
};

export const STATE_RULES = {
  Idle: { move: true, attack: true, jump: true, guard: true },
  WalkForward: { move: true, attack: true, jump: true, guard: true },
  WalkBackward: { move: true, attack: true, jump: true, guard: true },
  Crouch: { attack: true, guard: true },
  JumpStart: {}, Jump: { move: true, airAttack: true }, Landing: {},
  LightAttack: {}, HeavyAttack: {}, SkillAttack: {},
  Block: { guard: true, attack: true, jump: true },
  // Knockdown/GetUp are reserved until matching painted poses exist.
  Hit: {}, Knockback: {}, Knockdown: {}, GetUp: {}, Victory: {}, Defeat: {},
};

export const framesAt = seconds => Math.floor(seconds * COMBAT_FPS + 1e-7);
export const secondsAt = frames => frames / COMBAT_FPS;
export const permits = (fighter, action) => Boolean(STATE_RULES[fighter.state]?.[action]);
export function setFighterState(fighter, state) {
  if (fighter.state !== state) {
    fighter.state = state;
    fighter.stateTime = 0;
    fighter.stateFrame = 0;
  }
}

export function moveData(data) {
  const { startupFrames, activeFrames, recoveryFrames } = data;
  return {
    ...data,
    active: secondsAt(startupFrames),
    end: secondsAt(startupFrames + activeFrames),
    duration: secondsAt(startupFrames + activeFrames + recoveryFrames),
    stun: secondsAt(data.hitStunFrames),
    blockStun: secondsAt(data.blockStunFrames),
    // Keep these seconds for the existing animation/effect interface.
  };
}

export function movePhase(move, time) {
  const frame = framesAt(time);
  return frame < move.startupFrames ? 'startup'
    : frame < move.startupFrames + move.activeFrames ? 'active'
      : frame < move.startupFrames + move.activeFrames + move.recoveryFrames ? 'recovery' : 'ended';
}

// Local boxes use the fighter's feet as origin; negative y is above the feet.
// x is in facing direction, and world output uses canvas-style top-left x/y.
export function worldBox(fighter, box, floor, direction = fighter.facing) {
  return {
    x: fighter.x + (direction === 1 ? box.x : -box.x - box.width),
    y: floor - fighter.y + box.y, width: box.width, height: box.height,
  };
}
export const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y;
export function overlapCenter(a, b) {
  return { x: (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2,
    y: (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2 };
}

// Calibrated to the unchanged art: the head joint sits 60–70 units below its
// crown. Keep corresponding head/torso/far-leg/near-leg boxes for interpolation.
export const HURTBOX_PROFILES = {
  lieying: {
    standing: [
      { x: -52, y: -570, width: 104, height: 125 },
      { x: -60, y: -448, width: 120, height: 158 },
      { x: -130, y: -290, width: 105, height: 265 },
      { x: 25, y: -290, width: 105, height: 265 },
    ],
    crouching: [
      { x: -52, y: -466, width: 104, height: 125 },
      { x: -75, y: -344, width: 150, height: 158 },
      { x: -220, y: -186, width: 205, height: 166 },
      { x: 0, y: -186, width: 185, height: 166 },
    ],
  },
  hanfeng: {
    standing: [
      { x: -50, y: -580, width: 108, height: 135 },
      { x: -65, y: -448, width: 130, height: 158 },
      { x: -145, y: -290, width: 120, height: 265 },
      { x: 20, y: -290, width: 125, height: 265 },
    ],
    crouching: [
      { x: -50, y: -476, width: 108, height: 135 },
      { x: -80, y: -344, width: 165, height: 158 },
      { x: -240, y: -190, width: 220, height: 175 },
      { x: -5, y: -186, width: 210, height: 171 },
    ],
  },
};
export function hurtboxesFor(fighter, floor) {
  if (fighter.state === 'Defeat') return [];
  const profile = HURTBOX_PROFILES[fighter.id] || HURTBOX_PROFILES.lieying;
  const groundPose = fighter.y === 0 && (!fighter.jumpPhase || fighter.jumpPhase === 'ground');
  let blend = groundPose ? Math.max(0, Math.min(1, fighter.crouchBlend ?? (fighter.crouching ? 1 : 0))) : 0;
  blend = blend * blend * (3 - 2 * blend);
  const boxes = profile.standing.map((standing, i) => Object.fromEntries(['x', 'y', 'width', 'height']
    .map(key => [key, standing[key] + (profile.crouching[i][key] - standing[key]) * blend])));
  return boxes.map(box => worldBox(fighter, box, floor));
}
export function pushboxFor(fighter, floor) {
  return worldBox(fighter, { x: -COMBAT_RULES.pushWidth / 2, y: -COMBAT_RULES.pushHeight,
    width: COMBAT_RULES.pushWidth, height: COMBAT_RULES.pushHeight }, floor);
}
export function hitboxesFor(fighter, move, floor) {
  if (!fighter.attack || movePhase(move, fighter.attack.time) !== 'active' || fighter.attack.type === 'special') return [];
  return move.hitboxes.map(box => worldBox(fighter, box, floor, fighter.attack.direction));
}
export function projectileBox(projectile, floor, previousX = projectile.x) {
  const radius = projectile.radius || 62;
  // A swept rectangle prevents fast projectiles tunnelling between samples.
  return { x: Math.min(previousX, projectile.x) - radius, y: floor - projectile.y - radius * .65,
    width: Math.abs(projectile.x - previousX) + radius * 2, height: radius * 1.3 };
}
export function guardAllows(fighter, move, direction) {
  if (!fighter.blocking || fighter.y !== 0 || fighter.facing !== -direction) return false;
  if (move.height === 'unblockable') return false;
  if (move.height === 'low') return Boolean(fighter.crouching);
  if (move.height === 'high') return !fighter.crouching;
  return true;
}

export function canCancel(fighter, nextType) {
  const attack = fighter.attack;
  if (!attack || !attack.confirmedHit) return false;
  const cancel = attack.move.cancel;
  const frame = framesAt(attack.time);
  return Boolean(cancel?.into.includes(nextType) && frame >= cancel.fromFrame && frame <= cancel.untilFrame);
}
