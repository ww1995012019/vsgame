import { Game, CHARACTERS } from './engine.js';
import { Renderer, Sound } from './renderer.js';
import { poseFor, solveRig, drawRig } from './rig.js';

const $ = id => document.getElementById(id);
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode can deny storage; play remains available. */ } },
};
const sound = new Sound();
const settings = { difficulty: 'normal', volume: 45, shake: true, rain: true, muted: false, bones: false };
const savedSettings = storage.get('street-duel-settings', {});
if (savedSettings && typeof savedSettings === 'object') {
  if (['easy', 'normal', 'hard'].includes(savedSettings.difficulty)) settings.difficulty = savedSettings.difficulty;
  if (Number.isFinite(savedSettings.volume)) settings.volume = Math.min(100, Math.max(0, savedSettings.volume));
  for (const key of ['shake', 'rain', 'muted', 'bones']) if (typeof savedSettings[key] === 'boolean') settings[key] = savedSettings[key];
}
const storedHistory = storage.get('street-duel-history', []);
let history = Array.isArray(storedHistory) ? storedHistory.filter(row => row && Object.hasOwn(CHARACTERS, row.playerId) && [0, 1, -1].includes(row.winner) && Array.isArray(row.wins) && row.wins.length === 2 && row.wins.every(v => Number.isInteger(v) && v >= 0 && v <= 2) && Number.isFinite(row.combo) && Number.isFinite(row.date)).slice(0, 30) : [];
let toastTimeout;
let assetsReady = false;
let selectedCharacter = 'lieying';
let resultShown = false;
let fpsCount = 0, fpsTime = 0, hudTime = 0;
let calloutText = '';
let skillCallout = null;

export const game = new Game({ onEvent: onGameEvent });
const renderer = new Renderer($('game-canvas'), game);

function toast(message) {
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2400);
}

function onGameEvent(event) {
  sound.play(event);
  if (event.type === 'lowEnergy') toast(`气不足：此技能需要 ${event.cost} 气，命中或格挡可积攒能量`);
  if (event.type === 'attack' && ['special', 'skill'].includes(event.move)) {
    const character = CHARACTERS[event.character];
    skillCallout = { text: character[event.move], color: character.color, until: game.elapsed + .9, index: event.index };
  }
  if (event.type === 'roundEnd' && event.finished) {
    history.unshift({ playerId: event.playerId, winner: event.winner, wins: event.wins, combo: event.stats.maxCombo, date: Date.now() });
    history = history.slice(0, 30);
    storage.set('street-duel-history', history);
  }
}

function applySettings() {
  game.difficulty = settings.difficulty;
  sound.volume = settings.volume / 100;
  sound.muted = settings.muted;
  renderer.shakeEnabled = settings.shake;
  renderer.rainEnabled = settings.rain;
  renderer.showBones = settings.bones;
  $('bones-input').checked = settings.bones;
  $('bones-button').setAttribute('aria-pressed', String(settings.bones));
  $('bones-button').innerHTML = `${settings.bones ? '隐藏' : '显示'}骨骼 <kbd>B</kbd>`;
  $('difficulty-select').value = settings.difficulty;
  $('volume-input').value = settings.volume;
  $('volume-output').value = `${settings.volume}%`;
  $('shake-input').checked = settings.shake;
  $('rain-input').checked = settings.rain;
  $('difficulty-label').textContent = { easy: '新手难度', normal: '标准难度', hard: '高手难度' }[settings.difficulty];
  const muted = settings.muted || settings.volume === 0;
  $('sound-button').querySelector('span').textContent = muted ? '音效关闭' : '音效开启';
  $('sound-button').setAttribute('aria-label', muted ? '开启音效' : '关闭音效');
  $('sound-button').setAttribute('aria-pressed', String(muted));
}

function updateNames() {
  for (let i = 0; i < 2; i++) {
    const prefix = i === 0 ? 'player' : 'enemy', character = CHARACTERS[game.fighters[i].id];
    $(`${prefix}-name`).textContent = character.name;
    $(`${prefix}-subtitle`).textContent = character.subtitle;
    $(`${prefix}-portrait`).className = `portrait portrait-${character.id}`;
  }
  const character = CHARACTERS[game.fighters[0].id];
  $('special-name').textContent = character.special;
  $('skill-name').textContent = character.skill;
  $('skill-bar').style.setProperty('--fighter-accent', character.color);
  $('opponent-tag').textContent = game.training ? '木桩' : 'CPU';
  $('training-readout').hidden = !game.training;
  $('footer-mode').textContent = game.training ? '训练模式' : '街机模式';
  document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === (game.training ? 'training' : 'arena')));
}

function startMatch(training = false) {
  if (!assetsReady) return;
  closeAllDialogs();
  sound.unlock();
  game.start({ training, playerId: selectedCharacter });
  resultShown = false;
  skillCallout = null;
  $('start-prompt').hidden = true;
  $('pause-label').textContent = '暂停';
  updateNames();
  updateHud();
}

function openDialog(id) {
  closeAllDialogs(false);
  game.setPaused(true);
  $(id).showModal();
}

function closeAllDialogs(resume = true) {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  if (resume) { game.setPaused(false); game.clearInput(); }
}

function pause() {
  if (!['playing', 'intro'].includes(game.state)) return;
  if ($('pause-dialog').open) { closeAllDialogs(); return; }
  if (document.querySelector('dialog[open]')) return;
  openDialog('pause-dialog');
}

function openCharacters() {
  selectedCharacter = game.playerId;
  updateCharacterCards();
  openDialog('characters-dialog');
  document.querySelector('[data-nav="characters"]').classList.add('active');
}

function updateCharacterCards() {
  document.querySelectorAll('[data-character]').forEach(card => {
    const selected = card.dataset.character === selectedCharacter;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  $('confirm-character').textContent = `以${CHARACTERS[selectedCharacter].name}出战 →`;
}

function openLeaderboard() {
  $('stat-matches').textContent = history.length;
  $('stat-wins').textContent = history.filter(row => row.winner === 0).length;
  $('stat-combo').textContent = history.reduce((max, row) => Math.max(max, row.combo), 0);
  const container = $('match-history');
  container.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-history';
    empty.textContent = '荣誉榜还在等待第一个名字。\n完成一场三局两胜对战，留下你的战绩。';
    container.append(empty);
  } else {
    for (const row of history.slice(0, 8)) {
      const item = document.createElement('div');
      item.className = 'history-item';
      const result = document.createElement('span');
      result.className = `history-result ${row.winner === 0 ? '' : row.winner === 1 ? 'loss' : 'draw'}`;
      result.textContent = row.winner === 0 ? '胜利' : row.winner === 1 ? '惜败' : '平局';
      const info = document.createElement('span'); info.className = 'history-info';
      info.textContent = `${CHARACTERS[row.playerId].name}　${row.wins.join(' : ')}`;
      const date = document.createElement('small'); date.textContent = new Date(row.date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); info.append(date);
      const combo = document.createElement('span'); combo.className = 'history-combo'; combo.textContent = `MAX ${row.combo} HIT`;
      item.append(result, info, combo); container.append(item);
    }
  }
  openDialog('leaderboard-dialog');
  document.querySelector('[data-nav="leaderboard"]').classList.add('active');
}

function showResults() {
  resultShown = true;
  const result = game.result, won = result.winner === 0, draw = result.winner === -1;
  $('result-dialog').classList.toggle('lost', !won && !draw);
  $('result-eyebrow').textContent = result.finished ? won ? 'YOU OWN THE STREETS' : 'THE FIGHT GOES ON' : 'ROUND COMPLETE';
  $('result-title').textContent = draw ? '平分秋色' : result.finished ? won ? '全场制霸' : '再战，不止' : won ? '回合胜利' : '回合惜败';
  $('result-description').textContent = draw ? '这一回合不计胜负，下一回合见真章。' : result.finished ? won ? '今夜九龙，你的主场。' : '真正的格斗家，从不止步于一次失利。' : result.reason === 'timeout' ? '时间结束，剩余生命值决定了这一回合。' : won ? '漂亮的一击。保持节奏，拿下下一回合。' : '调整步伐，记得用 S 格挡对手的进攻。';
  $('result-player').textContent = CHARACTERS[game.fighters[0].id].name;
  $('result-enemy').textContent = CHARACTERS[game.fighters[1].id].name;
  $('result-score').textContent = game.wins.join(' : ');
  $('result-hits').textContent = game.matchStats.hits;
  $('result-combo').textContent = game.matchStats.maxCombo;
  $('result-damage').textContent = game.matchStats.damage;
  $('next-round-button').textContent = result.finished ? '再战一场 →' : '下一回合 →';
  openDialog('result-dialog');
}

function updateHud() {
  $('skill-bar').hidden = !['playing', 'intro'].includes(game.state);
  for (const [type, cost] of [['special', 50], ['skill', 35]]) {
    const button = $('skill-bar').querySelector(`[data-control=${type}]`);
    button.classList.toggle('unavailable', game.fighters[0].energy < cost);
    button.setAttribute('aria-label', `${CHARACTERS[game.fighters[0].id][type]}，消耗 ${cost} 气`);
  }
  const activeCallout = skillCallout && game.elapsed < skillCallout.until;
  $('skill-callout').hidden = !activeCallout;
  if (activeCallout) {
    $('skill-callout').textContent = skillCallout.text;
    $('skill-callout').style.color = skillCallout.color;
    $('skill-callout').classList.toggle('enemy-skill', skillCallout.index === 1);
  }
  for (let i = 0; i < 2; i++) {
    const f = game.fighters[i], prefix = i === 0 ? 'player' : 'enemy';
    const width = `calc(${f.hp}% - ${f.hp * .06}px)`;
    $(`${prefix}-health`).style.width = width;
    $(`${prefix}-health-lag`).style.width = width;
    $(`${prefix}-health`).setAttribute('aria-label', `${Math.ceil(f.hp)} 生命值`);
    $(`${prefix}-energy`).style.width = `${f.energy}%`;
    $(`${prefix}-energy-label`).textContent = f.energy >= 50 ? '必杀就绪' : `气 ${Math.floor(f.energy)}%`;
    $(`${prefix}-energy-label`).style.color = f.energy >= 50 ? '#ffed68' : '';
    $(`${prefix}-rounds`).querySelectorAll('i').forEach((dot, n) => dot.classList.toggle('won', n < game.wins[i]));
    const combo = $(`${prefix}-combo`);
    combo.classList.toggle('visible', game.comboDisplay[i] >= 2 && game.comboLife[i] > 0 && game.state === 'playing');
    combo.querySelector('b').textContent = game.comboDisplay[i];
  }
  $('timer').textContent = game.training ? '∞' : String(Math.ceil(game.timer)).padStart(2, '0');
  $('timer').parentElement.classList.toggle('low', !game.training && game.timer < 15);
  $('round-label').textContent = game.training ? 'TRAINING' : `ROUND ${String(game.round).padStart(2, '0')}`;
  $('mode-label').innerHTML = game.training ? 'TRAINING <em>·</em> 自由练习' : `ROUND ${game.round} <em>·</em> 自由对战`;
  $('training-damage').textContent = game.trainingDamage;
  $('training-hits').textContent = game.trainingHits;
  let text = '';
  if (game.state === 'intro') text = game.introTime > .85 ? `ROUND ${game.round}<small>三局两胜 · 先赢两局者胜</small>` : 'FIGHT!<small>即刻开战</small>';
  if (game.result && game.result.age < 1.3) text = game.result.reason === 'timeout' ? 'TIME UP<small>时间到</small>' : 'K.O.<small>胜负已分</small>';
  if (calloutText !== text) { $('battle-callout').innerHTML = text; $('battle-callout').classList.toggle('ko', text.includes('K.O.')); calloutText = text; }
}

$('start-button').addEventListener('click', () => startMatch());
$('restart-button').addEventListener('click', () => startMatch(game.training));
$('settings-button').addEventListener('click', () => openDialog('settings-dialog'));
$('pause-settings-button').addEventListener('click', () => openDialog('settings-dialog'));
$('pause-button').addEventListener('click', pause);
$('resume-button').addEventListener('click', () => closeAllDialogs());
$('leaderboard-play').addEventListener('click', () => startMatch());
$('reset-training').addEventListener('click', () => startMatch(true));
$('result-characters').addEventListener('click', openCharacters);
$('next-round-button').addEventListener('click', () => {
  const finished = game.result?.finished;
  closeAllDialogs();
  if (finished) startMatch();
  else { game.nextRound(); resultShown = false; updateHud(); }
});
document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.nav === 'characters') openCharacters();
  else if (button.dataset.nav === 'leaderboard') openLeaderboard();
  else if (button.dataset.nav === 'training') { startMatch(true); toast('训练模式：无限时间、自动恢复能量，尽情练习连招'); }
  else if (game.training) startMatch(false);
  else { closeAllDialogs(); updateNames(); }
}));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { closeAllDialogs(); updateNames(); }));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (dialog.id === 'result-dialog') return;
    closeAllDialogs(); updateNames();
  });
  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) { game.setPaused(false); game.clearInput(); updateNames(); }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || dialog.id === 'result-dialog') return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { closeAllDialogs(); updateNames(); }
  });
});
document.querySelectorAll('[data-character]').forEach(card => card.addEventListener('click', () => { selectedCharacter = card.dataset.character; updateCharacterCards(); }));
$('confirm-character').addEventListener('click', () => startMatch(game.training));
$('volume-input').addEventListener('input', event => { $('volume-output').value = `${event.target.value}%`; });
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  settings.difficulty = $('difficulty-select').value;
  settings.volume = Number($('volume-input').value);
  settings.shake = $('shake-input').checked;
  settings.rain = $('rain-input').checked;
  settings.bones = $('bones-input').checked;
  storage.set('street-duel-settings', settings);
  applySettings(); closeAllDialogs(); sound.unlock(); toast('设置已保存');
});
$('sound-button').addEventListener('click', () => {
  settings.muted = !settings.muted;
  if (!settings.muted && !settings.volume) settings.volume = 45;
  sound.unlock(); applySettings(); storage.set('street-duel-settings', settings);
});
$('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else toast('当前浏览器不支持全屏，可横屏游玩');
  } catch { toast('当前浏览器暂不允许全屏'); }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '切换全屏');
});

function toggleBones() {
  settings.bones = !settings.bones;
  applySettings();
  storage.set('street-duel-settings', settings);
}
$('bones-button').addEventListener('click', toggleBones);

const keyMap = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'jump', ArrowUp: 'jump', KeyS: 'block', ArrowDown: 'block', KeyJ: 'punch', KeyK: 'kick', KeyL: 'special', KeyO: 'skill' };
const keysDown = new Set();
document.addEventListener('keydown', event => {
  if (event.code === 'Escape') {
    if (!document.querySelector('dialog[open]')) { event.preventDefault(); pause(); }
    return;
  }
  if (document.querySelector('dialog[open]')) {
    if (event.code === 'Enter' && $('pause-dialog').open) { event.preventDefault(); closeAllDialogs(); }
    return;
  }
  if (event.code === 'Enter' && game.state === 'ready') { event.preventDefault(); startMatch(); return; }
  if (event.code === 'KeyB' && !event.repeat) { event.preventDefault(); toggleBones(); return; }
  const action = keyMap[event.code];
  if (!action) return;
  event.preventDefault();
  if (event.repeat) return;
  keysDown.add(event.code);
  if (game.state === 'playing') { sound.unlock(); game.setInput(action, true); }
});
document.addEventListener('keyup', event => {
  keysDown.delete(event.code);
  const action = keyMap[event.code];
  if (action && ![...keysDown].some(code => keyMap[code] === action)) game.setInput(action, false);
});
window.addEventListener('blur', () => { keysDown.clear(); game.clearInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && ['playing', 'intro'].includes(game.state) && !document.querySelector('dialog[open]')) pause(); });
const activePointers = new Map();
document.querySelectorAll('[data-control]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    sound.unlock();
    button.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, button.dataset.control);
    if (game.state === 'playing') game.setInput(button.dataset.control, true);
    button.classList.add('pressed');
  });
  const release = event => {
    const action = activePointers.get(event.pointerId);
    activePointers.delete(event.pointerId);
    if (action && ![...activePointers.values()].includes(action)) game.setInput(action, false);
    button.classList.remove('pressed');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
});

document.querySelectorAll('.character-art').forEach(art => {
  const id = art.classList.contains('art-lieying') ? 'lieying' : 'hanfeng';
  const canvas = document.createElement('canvas'); canvas.width = 340; canvas.height = 560;
  canvas.style.cssText = 'width:100%;height:100%;object-fit:contain';
  const ctx = canvas.getContext('2d'); ctx.translate(160, 542);
  drawRig(ctx, solveRig(poseFor({ id, y: 0 }, 0)), id);
  art.style.backgroundImage = 'none'; art.append(canvas);
});

applySettings();
updateNames();
updateHud();
$('asset-loading').hidden = false;
renderer.load().then(() => {
  assetsReady = true;
  $('asset-loading').hidden = true;
  $('preview-fighters').hidden = true;
  $('preview-notice').hidden = true;
  $('start-button').disabled = false;
}).catch(error => {
  $('asset-loading').replaceChildren();
  const message = document.createElement('b'); message.textContent = error.message;
  const retry = document.createElement('button'); retry.className = 'button button-yellow'; retry.textContent = '重新加载'; retry.addEventListener('click', () => location.reload());
  $('asset-loading').append(message, retry);
});
let previous = performance.now(), accumulator = 0;
function frame(now) {
  const dt = Math.min((now - previous) / 1000, .1); previous = now;
  accumulator += dt;
  while (accumulator >= 1 / 120) { game.update(1 / 120); accumulator -= 1 / 120; }
  renderer.render(dt);
  hudTime += dt;
  if (hudTime >= .04) { updateHud(); hudTime = 0; }
  if (game.result?.age > 1.45 && !resultShown) showResults();
  fpsCount++; fpsTime += dt;
  if (fpsTime >= 1) { $('fps-label').textContent = `${Math.round(fpsCount / fpsTime)} FPS`; fpsCount = 0; fpsTime = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
