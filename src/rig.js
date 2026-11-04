// Continuous 2D skeletal animation. Spine/arms use forward kinematics;
// the legs use a soft two-bone IK solve to keep the soles on their targets.
// Artwork is drawn on bones, never selected from whole-character sprite frames.
const radians = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const point = (x, y) => ({ x, y });
const add = (a, b) => point(a.x + b.x, a.y + b.y);
const axis = (angle, length, up = false) => point(Math.sin(angle * radians) * length, Math.cos(angle * radians) * length * (up ? -1 : 1));
const REST_POSE = { rootX: 0, rootY: 0, lean: 3, head: -3, nUp: 8, nBend: 137, fUp: 48, fBend: 106, nX: 74, nY: -18, fX: -86, fY: -18, nPitch: 0, fPitch: 0 };

export const BONE_LENGTHS = { thigh: 136, shin: 130, upperArm: 83, forearm: 79, torso: 128 };
export const BONE_LINKS = [
  ['hip', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['shoulderF', 'elbowF'], ['elbowF', 'wristF'], ['shoulderN', 'elbowN'], ['elbowN', 'wristN'],
  ['hipF', 'kneeF'], ['kneeF', 'ankleF'], ['hipN', 'kneeN'], ['kneeN', 'ankleN'],
];

// Times match the simulation's anticipation, active and recovery windows.
export const MOTIONS = {
  punch: [[0, {}], [.055, { lean: -5, nUp: -15, nBend: 130 }], [.09, { rootX: 15, lean: 14, nUp: 103, nBend: 3, fUp: 12, fBend: 137 }], [.18, { rootX: 15, lean: 14, nUp: 103, nBend: 3 }], [.31, {}]],
  kick: [[0, {}], [.1, { rootY: 14, lean: -8, nX: 45, nY: -140, nPitch: -15 }], [.18, { rootX: -16, lean: -16, nX: 208, nY: -338, nPitch: -12, nUp: -24, nBend: 123 }], [.31, { rootX: -16, lean: -16, nX: 208, nY: -338, nPitch: -12 }], [.43, { nX: 80, nY: -125 }], [.53, {}]],
  flame: [[0, {}], [.13, { rootY: 20, lean: -8, nUp: -20, nBend: 115, fUp: -12, fBend: 111 }], [.23, { rootX: 18, lean: 14, nUp: 105, nBend: 0, fUp: 96, fBend: 4 }], [.43, { rootX: 18, lean: 14, nUp: 105, nBend: 0, fUp: 96, fBend: 4 }], [.75, {}]],
  ice: [[0, {}], [.13, { rootY: 18, lean: -6, nUp: 12, nBend: 155, fUp: 8, fBend: 122 }], [.23, { rootX: 12, lean: 10, nUp: 103, nBend: 3, fUp: 80, fBend: 12 }], [.43, { rootX: 12, lean: 10, nUp: 103, nBend: 3, fUp: 80, fBend: 12 }], [.75, {}]],
  dash: [[0, {}], [.10, { rootY: 25, lean: 20, nUp: -42, nBend: 110, fUp: 85, fBend: 75 }], [.24, { rootX: 18, lean: 29, nUp: 120, nBend: 0, fUp: -15, fBend: 105, nX: 88, fX: -130, fY: -35 }], [.42, { rootX: 18, lean: 20, nUp: 112, nBend: 3, fX: -130 }], [.78, {}]],
  uppercut: [[0, {}], [.14, { rootY: 54, lean: 15, nUp: -12, nBend: 102, fUp: 64, fBend: 90 }], [.24, { rootY: -22, lean: -6, nUp: 170, nBend: 8, fUp: 10, fBend: 125, nX: 40, nY: -80 }], [.43, { rootY: -22, lean: -6, nUp: 170, nBend: 8, nX: 40, nY: -80 }], [.61, { rootY: 16 }], [.78, {}]],
};

export function sampleMotion(keys, time) {
  let i = 0;
  while (i < keys.length - 2 && time > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  const t = ease(Math.max(0, Math.min(1, (time - t0) / (t1 - t0))));
  return Object.fromEntries(Object.entries(REST_POSE).map(([key, value]) => [key, lerp(a[key] ?? value, b[key] ?? value, t)]));
}

export function twoBoneIK(root, target, upper, lower, bend = 1) {
  const dx = target.x - root.x, dy = target.y - root.y;
  const distance = Math.hypot(dx, dy), full = upper + lower;
  const start = full * .965, span = full - start;
  const reach = distance > start ? start + span * (1 - Math.exp(-(distance - start) / span)) : distance;
  const d = Math.max(Math.abs(upper - lower) + .001, reach);
  const ux = distance > .000001 ? dx / distance : 0, uy = distance > .000001 ? dy / distance : 1;
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return [point(root.x + ux * along + uy * height * bend, root.y + uy * along - ux * height * bend), point(root.x + ux * d, root.y + uy * d)];
}

export function poseFor(f, elapsed = 0, index = 0, result = null) {
  let pose = { ...REST_POSE };
  const breath = Math.sin(elapsed * 3.5 + index * 1.7);
  pose.rootY = breath * 1.5;
  pose.nUp += breath * 1.6;
  pose.fBend += breath * 1.5;
  if (f.walking && !f.attack && !f.stun && f.y <= 1) {
    // Each foot travels back at the body's speed during stance, then lifts.
    const direction = (f.move || 1) * f.facing;
    const foot = phase => {
      const u = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
      return u < .6 ? [lerp(75, -75, u / .6) * direction, -18] : [lerp(-75, 75, ease((u - .6) / .4)) * direction, -18 - Math.sin((u - .6) / .4 * Math.PI) * 52];
    };
    [pose.nX, pose.nY] = foot(f.stride || 0);
    [pose.fX, pose.fY] = foot((f.stride || 0) + Math.PI);
    pose.rootY = 5 + Math.cos((f.stride || 0) * 2) * 3;
    pose.lean = direction * 7;
    pose.nUp += Math.sin(f.stride || 0) * 12;
    pose.fUp -= Math.sin(f.stride || 0) * 12;
  }
  if (f.y > 1 && !f.attack) Object.assign(pose, { nX: 90, nY: -105, fX: -70, fY: -72, lean: 9, nUp: 45, nBend: 110, fUp: 90, fBend: 70 });
  if (f.blocking) Object.assign(pose, { rootY: 17, lean: 10, nUp: 40, nBend: 143, fUp: 65, fBend: 120 });
  if (f.attack) {
    const clip = f.attack.type === 'special' ? f.id === 'lieying' ? 'flame' : 'ice' : f.attack.type === 'skill' ? f.id === 'lieying' ? 'dash' : 'uppercut' : f.attack.type;
    pose = sampleMotion(MOTIONS[clip], f.attack.time);
  }
  if (f.stun > 0 && !f.blocking) Object.assign(pose, { lean: -19, head: -12, rootX: -10, rootY: 12, nUp: -38, nBend: 85, fUp: 70, fBend: 35 });
  if (result?.winner === index) Object.assign(pose, { nUp: 165, nBend: 20, fUp: 35, fBend: 120, lean: -3 });
  return pose;
}

export function solveRig(pose) {
  const p = pose, hip = point(p.rootX, -249 + p.rootY);
  const chest = add(hip, axis(p.lean, BONE_LENGTHS.torso, true));
  const neck = add(chest, axis(p.lean, 22, true));
  const head = add(neck, axis(p.lean + p.head, 44, true));
  const shoulderN = add(chest, point(-20, 13)), shoulderF = add(chest, point(23, 10));
  const arm = (shoulder, angle, bend) => {
    const elbow = add(shoulder, axis(angle - p.lean, BONE_LENGTHS.upperArm));
    return [elbow, add(elbow, axis(angle - p.lean + bend, BONE_LENGTHS.forearm))];
  };
  const [elbowN, wristN] = arm(shoulderN, p.nUp, p.nBend);
  const [elbowF, wristF] = arm(shoulderF, p.fUp, p.fBend);
  const hipN = add(hip, point(-14, 0)), hipF = add(hip, point(14, 0));
  const [kneeN, ankleN] = twoBoneIK(hipN, point(p.nX, p.nY), BONE_LENGTHS.thigh, BONE_LENGTHS.shin);
  const [kneeF, ankleF] = twoBoneIK(hipF, point(p.fX, p.fY), BONE_LENGTHS.thigh, BONE_LENGTHS.shin);
  return { hip, chest, neck, head, shoulderN, shoulderF, elbowN, elbowF, wristN, wristF, hipN, hipF, kneeN, kneeF, ankleN, ankleF, pose: p };
}

export const PALETTES = {
  lieying: { skin: '#e9a783', skinLight: '#ffd3a3', skinDark: '#a95946', cloth: '#eeb72d', clothLight: '#ffe07b', clothDark: '#a76b20', pants: '#262b37', pantsLight: '#444753', pantsDark: '#171d29', trim: '#ffd05b', wrap: '#ad3444', wrapLight: '#e26465', hair: '#222531', hairLight: '#505264', boot: '#242731' },
  hanfeng: { skin: '#c98f73', skinLight: '#f4c09c', skinDark: '#8b5248', cloth: '#243c58', clothLight: '#526c85', clothDark: '#142439', pants: '#dce7ed', pantsLight: '#ffffff', pantsDark: '#8b9fae', trim: '#69e1ed', wrap: '#204c73', wrapLight: '#699ac0', hair: '#dce8f1', hairLight: '#ffffff', boot: '#192d41' },
};

const INK = '#101722';
function shape(ctx, points, fill, stroke = INK, width = 2.5) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function line(ctx, points, color, width = 2) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
}
function gradient(ctx, x0, y0, x1, y1, dark, light) {
  const fill = ctx.createLinearGradient(x0, y0, x1, y1); fill.addColorStop(0, dark); fill.addColorStop(.42, light); fill.addColorStop(1, dark); return fill;
}
function segment(ctx, a, b, widthA, widthB, base, light, dark, stripe = null) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
  ctx.fillStyle = gradient(ctx, -widthA, 0, widthA, 0, dark, light);
  ctx.beginPath(); ctx.moveTo(-widthA * .63, -8); ctx.quadraticCurveTo(-widthA * 1.1, length * .3, -widthB, length - 8);
  ctx.quadraticCurveTo(0, length + 11, widthB, length - 8); ctx.quadraticCurveTo(widthA * .9, length * .4, widthA * .63, -8); ctx.quadraticCurveTo(0, -18, -widthA * .63, -8); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
  line(ctx, [[-widthA * .32, 6], [-widthB * .48, length - 12]], base, 3);
  if (stripe) line(ctx, [[widthA * .5, 3], [widthB * .58, length - 10]], stripe, 4);
  ctx.restore();
}

function drawFoot(ctx, a, pitch, p) {
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(pitch * radians);
  shape(ctx, [[-22, -29], [16, -25], [20, -8], [42, 0], [45, 15], [-26, 15], [-26, -7]], p.boot);
  shape(ctx, [[-25, 9], [44, 9], [45, 16], [-26, 16]], p.pantsLight);
  line(ctx, [[-18, -21], [10, -18], [21, 0], [38, 4]], p.trim, 3);
  for (let i = 0; i < 3; i++) line(ctx, [[-10, -18 + i * 6], [12, -15 + i * 6]], '#b2b4ad', 2);
  ctx.restore();
}
function drawLeg(ctx, hip, knee, ankle, pitch, p, ice) {
  segment(ctx, hip, knee, 38, 30, p.pants, p.pantsLight, p.pantsDark, ice ? '#b94150' : p.trim);
  segment(ctx, knee, ankle, 32, 20, p.pants, p.pantsLight, p.pantsDark, ice ? '#a53549' : p.trim);
  const x = hip.x + (knee.x - hip.x) * .4, y = hip.y + (knee.y - hip.y) * .4;
  line(ctx, [[x - 7, y - 15], [x + 9, y - 4], [x - 5, y + 12], [x + 8, y + 28], [x - 4, y + 46]], ice ? '#a33249' : '#c18b34', 5);
  line(ctx, [[knee.x - 15, knee.y - 8], [knee.x + 9, knee.y + 5]], p.pantsDark, 2);
  drawFoot(ctx, ankle, pitch, p);
}
function drawArm(ctx, shoulder, elbow, wrist, p, jacket) {
  segment(ctx, shoulder, elbow, jacket ? 27 : 25, jacket ? 23 : 18, jacket ? p.cloth : p.skin, jacket ? p.clothLight : p.skinLight, jacket ? p.clothDark : p.skinDark, jacket ? '#343a45' : null);
  segment(ctx, elbow, wrist, 18, 14, p.skin, p.skinLight, p.skinDark);
  const wrapStart = point(lerp(elbow.x, wrist.x, .55), lerp(elbow.y, wrist.y, .55));
  segment(ctx, wrapStart, wrist, 17, 16, p.wrap, p.wrapLight, p.wrap);
  const angle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
  ctx.save(); ctx.translate(wrist.x, wrist.y); ctx.rotate(angle);
  shape(ctx, [[-9, -14], [17, -15], [24, -4], [22, 11], [2, 17], [-10, 9]], p.wrap);
  line(ctx, [[9, -10], [9, 3], [20, 3]], p.wrapLight, 2);
  line(ctx, [[-3, -6], [0, 10]], p.wrapLight, 2);
  ctx.restore();
  // Skin and sleeve creases emphasize the elbow rather than hiding the joint.
  line(ctx, [[elbow.x - 8, elbow.y - 5], [elbow.x + 7, elbow.y]], jacket ? p.clothDark : p.skinDark, 2);
}
function drawTorso(ctx, r, p, ice) {
  ctx.save(); ctx.translate(r.hip.x, r.hip.y); ctx.rotate(r.pose.lean * radians);
  shape(ctx, [[-37, -7], [-43, -111], [-24, -143], [28, -142], [49, -115], [34, -6]], gradient(ctx, -40, 0, 45, 0, p.skinDark, p.skinLight));
  // Short yellow jacket / sleeveless navy gi preserve the original identities.
  shape(ctx, [[-36, -136], [-55, -114], [-42, -30], [-15, -28], [-23, -107], [-10, -138]], gradient(ctx, -49, 0, -10, 0, p.clothDark, p.clothLight));
  shape(ctx, [[21, -140], [46, -124], [49, -39], [22, -31], [10, -96]], gradient(ctx, 11, 0, 49, 0, p.clothDark, p.clothLight));
  line(ctx, [[-10, -138], [-21, -107], [-12, -32]], ice ? '#bec8d1' : p.trim, 3);
  line(ctx, [[21, -137], [12, -96], [26, -34]], ice ? '#bec8d1' : p.trim, 3);
  if (!ice) {
    shape(ctx, [[-21, -105], [17, -105], [23, -78], [-17, -75]], '#222735');
    line(ctx, [[-14, -94], [12, -94]], '#59606b', 2);
  } else {
    line(ctx, [[0, -118], [0, -44]], p.skinDark, 2);
    for (let i = 0; i < 3; i++) line(ctx, [[-11, -105 + i * 22], [1, -102 + i * 22], [14, -109 + i * 22]], p.skinDark, 2);
    line(ctx, [[34, -108], [25, -96], [36, -89], [27, -74], [36, -62]], '#bedbe2', 3);
  }
  line(ctx, [[0, -64], [-3, -49], [6, -47]], p.skinDark, 2);
  shape(ctx, [[-38, -23], [36, -22], [35, 5], [-36, 4]], p.pants);
  shape(ctx, [[-39, -16], [37, -18], [37, -6], [-38, -3]], ice ? '#a9364d' : '#373641');
  shape(ctx, [[9, -16], [25, -11], [14, 6], [2, -4]], ice ? '#db5964' : p.trim);
  const sway = Math.sin(r.pose.nUp * .05) * 8;
  shape(ctx, [[13, -6], [27, -3], [37 + sway, 76], [18 + sway, 65]], ice ? '#ae3b52' : '#d59c2d');
  shape(ctx, [[3, -4], [13, -3], [-7 - sway, 52], [-19 - sway, 57]], ice ? '#c34a5b' : '#e2b541');
  ctx.restore();
}
function drawHead(ctx, r, p, ice) {
  ctx.save(); ctx.translate(r.neck.x, r.neck.y); ctx.rotate((r.pose.lean + r.pose.head) * radians);
  shape(ctx, [[-13, 5], [-13, -27], [15, -30], [22, -3], [10, 12]], p.skin);
  shape(ctx, [[-26, -62], [-16, -87], [15, -91], [35, -72], [34, -53], [44, -41], [33, -36], [29, -16], [10, -8], [-17, -27]], gradient(ctx, -20, 0, 35, 0, p.skinDark, p.skinLight));
  // Angular hair tufts, with a short tied lock on the yellow fighter.
  if (!ice) shape(ctx, [[-24, -57], [-51, -51], [-37, -70], [-46, -88], [-20, -93], [-8, -110], [7, -103], [28, -103], [41, -86], [37, -61], [22, -71], [1, -53], [10, -77], [-14, -55]], p.hair);
  else shape(ctx, [[-24, -51], [-41, -64], [-31, -72], [-40, -88], [-20, -85], [-19, -104], [-4, -96], [9, -112], [15, -97], [31, -105], [43, -88], [36, -70], [18, -75], [5, -58], [9, -81], [-10, -61]], p.hair);
  line(ctx, [[-25, -83], [-6, -90], [19, -89]], p.hairLight, 4);
  line(ctx, [[-22, -73], [-3, -82], [20, -82]], p.hairLight, 2);
  shape(ctx, [[-24, -52], [-13, -55], [-8, -40], [-15, -32], [-23, -39]], p.skin);
  line(ctx, [[19, -57], [32, -56]], INK, 3.5);
  shape(ctx, [[20, -52], [33, -52], [29, -46], [22, -47]], '#f7f3de', null);
  line(ctx, [[29, -51], [29, -47]], ice ? '#278dbd' : '#5d452c', 3);
  line(ctx, [[34, -37], [29, -35]], p.skinDark, 2);
  line(ctx, [[22, -24], [32, -26]], INK, 1.6);
  line(ctx, [[2, -34], [11, -22]], p.skinDark, 1.5);
  ctx.restore();
}

export function drawRig(ctx, rig, id, { bones = false, opacity = 1 } = {}) {
  const p = PALETTES[id], ice = id === 'hanfeng';
  ctx.save(); ctx.globalAlpha *= opacity;
  ctx.save(); ctx.globalAlpha *= .86;
  drawArm(ctx, rig.shoulderF, rig.elbowF, rig.wristF, p, !ice);
  drawLeg(ctx, rig.hipF, rig.kneeF, rig.ankleF, rig.pose.fPitch, p, ice);
  ctx.restore();
  drawLeg(ctx, rig.hipN, rig.kneeN, rig.ankleN, rig.pose.nPitch, p, ice);
  drawTorso(ctx, rig, p, ice);
  drawHead(ctx, rig, p, ice);
  drawArm(ctx, rig.shoulderN, rig.elbowN, rig.wristN, p, !ice);
  if (bones) {
    ctx.save(); ctx.shadowBlur = 0; ctx.shadowColor = '#05090b';
    for (const [a, b] of BONE_LINKS) line(ctx, [[rig[a].x, rig[a].y], [rig[b].x, rig[b].y]], '#8fffe7', 2.3);
    for (const name of new Set(BONE_LINKS.flat())) {
      ctx.beginPath(); ctx.arc(rig[name].x, rig[name].y, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#fff9c9'; ctx.fill(); ctx.strokeStyle = '#0d292d'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
