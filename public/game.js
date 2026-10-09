'use strict';
// =============================================================================
// Tank en carton — client navigateur
// =============================================================================

const $ = selector => document.querySelector(selector);
const c = $('#arena'), x = c.getContext('2d');
const lobby = $('#lobby'), game = $('#game'), nameEl = $('#name'), statusEl = $('#status'), net = $('#net');
const startBtn = $('#start'), abandon = $('#abandon'), abandonMatch = $('#abandonMatch');
const upgradePanel = $('#upgradePanel'), prepTimer = $('#prepTimer'), upgradeStatus = $('#upgradeStatus');
const botModal = $('#botModal'), closeBotModal = $('#closeBotModal'), cancelBotModal = $('#cancelBotModal');
const mapSelect = $('#mapSelect'), mapPreview = $('#mapPreview'), classGrid = $('#classGrid');
const arenaWrap = $('.arena-wrap'), scoreOverlay = $('#scoreOverlay'), overlayScore = $('#overlayScore');
const prepScore = $('#prepScore'), prepClass = $('#prepClass');
const modeSelect = $('#modeSelect'), brBanner = $('#brBanner'), leftLabel = $('#leftLabel'), rightLabel = $('#rightLabel');
const setWins = $('#setWins'), setZone = $('#setZone'), setPowers = $('#setPowers'), winsLabel = $('#winsLabel'), zoneSetting = $('#zoneSetting'), settingsHint = $('#settingsHint');
const colorPicker = $('#colorPicker'), joinUrl = $('#joinUrl'), joinOther = $('#joinOther'), qrBox = $('#qr'), awardsEl = $('#awards');
const soundToggle = $('#soundToggle'), mouseToggle = $('#mouseToggle'), mouseHelp = $('#mouseHelp');

let walls = [], worldW = 960, worldH = 560, theme = null;
let state = { mode: 'lobby', gameMode: 'teams', tanks: [], bullets: [], score: [0, 0], running: false, winner: '', powerups: [] };
let mines = [], seenFxSeq = 0, explosionAnims = [], seenPickupSeq = 0, pickupAnims = [], seenNoticeSeq = 0, noticeAnims = [];
let tracks = [], wrecks = [], shake = 0, hurtFlash = 0;
const mode = () => state.gameMode || 'teams';
const isBR = () => mode() === 'br';
const isFFA = () => mode() === 'br' || mode() === 'elim';          // chacun pour soi
const isRespawn = () => ['koth', 'ctf', 'elim'].includes(mode());   // une seule manche avec réapparitions
const DEFAULT_SETTINGS = { teamsWins: 5, brWins: 3, ctfCaps: 3, kothTime: 60, elimLives: 3, zoneSpeed: 'normal', powers: {} };
const settings = () => state.settings || DEFAULT_SETTINGS;
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const MODE_INFO = {
  teams: { icon: '⚔', name: 'Équipes', text: s => `jaune contre bleu, la dernière équipe en vie gagne la manche. Première équipe à <b>${plural(s.teamsWins, 'manche')}</b>.` },
  br:    { icon: '👑', name: 'Battle royale', text: s => `chacun pour soi, pas d'équipes ! Une zone rouge rétrécit : reste dedans. Le premier à <b>${plural(s.brWins, 'manche')}</b> gagne.` },
  koth:  { icon: '⛰', name: 'Roi de la colline', text: s => `jaune contre bleu : tenez la colline au centre. La première équipe à <b>${s.kothTime} s</b> de contrôle gagne. Réapparition après 3 s.` },
  ctf:   { icon: '🚩', name: 'Capture du drapeau', text: s => `vole le drapeau ennemi et ramène-le à ta base (ton propre drapeau doit y être). <b>${plural(s.ctfCaps, 'capture')}</b> pour gagner. Réapparition après 3 s.` },
  elim:  { icon: '💀', name: 'Élimination', text: s => `chacun pour soi avec <b>${plural(s.elimLives, 'vie')}</b> pour toute la partie. Le dernier survivant gagne.` },
};
// Réglage principal de chaque mode : [clé, libellé, min, max]
const WIN_SETTING = {
  teams: ['teamsWins', 'Manches pour gagner', 1, 15], br: ['brWins', 'Manches pour gagner', 1, 10],
  koth: ['kothTime', 'Secondes sur la colline', 15, 300], ctf: ['ctfCaps', 'Captures pour gagner', 1, 10], elim: ['elimLives', 'Vies par joueur', 1, 10],
};
const POWER_INFO = {
  speed:    { color: '#fb923c', icon: '⚡', name: 'Turbo' },
  shield:   { color: '#a78bfa', icon: '◆', name: 'Bouclier' },
  rapid:    { color: '#22d3ee', icon: '»', name: 'Tir rapide' },
  homing:   { color: '#f472b6', icon: '🎯', name: 'Téléguidé' },
  rocket:   { color: '#ef4444', icon: '🚀', name: 'Roquette' },
  spread:   { color: '#4ade80', icon: '✳', name: 'Tir x5' },
  bouncy:   { color: '#e879f9', icon: '∞', name: 'Rebond infini' },
  mine:     { color: '#94a3b8', icon: '💣', name: 'Mines' },
  invis:    { color: '#cbd5e1', icon: '👻', name: 'Invisible' },
  laser:    { color: '#f43f5e', icon: '✦', name: 'Laser' },
  magnet:   { color: '#facc15', icon: '🧲', name: 'Aimant' },
  teleport: { color: '#38bdf8', icon: '🌀', name: 'Téléport' },
};
let PALETTE = ['#ffd24d', '#75d8ff', '#f87171', '#a3e635', '#c084fc', '#fb923c', '#f472b6', '#2dd4bf', '#e5e7eb', '#fde047', '#60a5fa', '#34d399', '#fca5a5', '#d8b4fe', '#fdba74', '#5eead4'];
let ADDRESSES = [];
let players = [], keys = {}, id = '', ws, retry;
let visualTanks = new Map(), snapshotAt = performance.now(), lastFrame = performance.now();
let seenKillSeq = 0, killAnimations = [], debris = [];
let tabHeld = false;

// Préférences du joueur, gardées dans ce navigateur.
const pref = (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (_) { return fallback; } };
const savePref = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
let soundOn = pref('sound', 'on') !== 'off', mouseAim = pref('mouseAim', 'off') === 'on';
soundToggle.checked = soundOn; mouseToggle.checked = mouseAim; mouseHelp.hidden = !mouseAim;
soundToggle.onchange = () => { soundOn = soundToggle.checked; savePref('sound', soundOn ? 'on' : 'off'); };
mouseToggle.onchange = () => { mouseAim = mouseToggle.checked; mouseHelp.hidden = !mouseAim; savePref('mouseAim', mouseAim ? 'on' : 'off'); };

// Caractéristiques des classes (remplacées par celles du serveur à la connexion).
let CLASSES = {
  light:  { name: 'Léger',  hp: 2, speed: 1.35, reload: 0.60, bullet: 1.00, damage: 1, radius: 15 },
  heavy:  { name: 'Lourd',  hp: 5, speed: 0.72, reload: 1.30, bullet: 0.90, damage: 1, radius: 20 },
  sniper: { name: 'Sniper', hp: 3, speed: 0.92, reload: 1.95, bullet: 1.75, damage: 2, radius: 17 },
};
const CLASS_TEXT = {
  light:  'Rapide et nerveux, tire vite. Mais 2 PV seulement.',
  heavy:  'Un blindage énorme (5 PV), mais lent à manœuvrer.',
  sniper: 'Obus très rapides : 2 dégâts, un ricochet de plus et visée laser.',
};
// Dimensions de dessin de chaque char (proportionnées à leur rayon de collision).
const SHAPES = {
  light:  { L: 30, W: 18, t: 6, tr: 8,  bl: 22, bw: 5 },
  heavy:  { L: 40, W: 26, t: 8, tr: 12, bl: 27, bw: 9 },
  sniper: { L: 34, W: 22, t: 6, tr: 9,  bl: 40, bw: 4 },
};

const TEAM_NAME = { yellow: 'jaune', blue: 'bleue' };
const TEAM_COLOR = { yellow: '#ffd24d', blue: '#75d8ff' };
const FIGHTER_TEAMS = ['yellow', 'blue', 'player'];
const isFighter = p => FIGHTER_TEAMS.includes(p?.team);
const teamBoard = $('#teamBoard'), brColumn = $('.br-column');
const className = cls => (CLASSES[cls] || CLASSES.light).name;

function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function me() { return players.find(p => p.id === id); }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// =============================================================================
// Lobby
// =============================================================================

function rosterItem(p) {
  const mine = p.id === id, bot = p.isBot;
  const role = bot ? `IA ${p.difficulty === 'easy' ? 'facile' : p.difficulty === 'hard' ? 'difficile' : 'normale'}` : p.host ? 'Hôte du salon' : 'Joueur';
  const removeBtn = bot && me()?.host ? `<button type="button" class="remove-bot" data-remove-bot="${p.id}" title="Retirer ce bot">×</button>` : '';
  const ring = p.prefColor ? ` style="box-shadow:inset 0 0 0 2px ${p.prefColor}"` : '';
  return `<div class="roster-item ${bot ? 'bot' : ''} ${mine ? 'mine' : ''}"><span class="roster-avatar"${ring}>${bot ? 'BOT' : escapeHtml(p.name).slice(0, 1).toUpperCase()}</span><div><b>${escapeHtml(p.name)}</b><small>${role} · ${className(p.tankClass)}</small></div>${removeBtn}</div>`;
}

let lobbySignature = '';
function renderLobby() {
  const mine = me();
  const signature = JSON.stringify([players.map(p => [p.id, p.name, p.team, p.host, p.tankClass, p.difficulty, p.prefColor]), id, state.map?.id, state.gameMode, state.settings, ADDRESSES]);
  if (signature === lobbySignature) return;
  lobbySignature = signature;

  const ffa = isFFA();
  teamBoard.classList.toggle('br-mode', ffa);
  brColumn.hidden = !ffa;
  const groups = { player: [], yellow: [], spectator: [], blue: [] };
  for (const p of players) (groups[p.team] || groups.spectator).push(p);
  for (const team of ['player', 'yellow', 'spectator', 'blue']) {
    document.getElementById(`${team}Players`).innerHTML = groups[team].map(rosterItem).join('') || '<div class="empty-team">Aucun participant</div>';
    document.getElementById(`${team}Count`).textContent = groups[team].length;
  }
  document.querySelectorAll('[data-remove-bot]').forEach(button => {
    button.onpointerup = event => {
      event.preventDefault(); event.stopPropagation();
      const botId = button.dataset.removeBot;
      if (!botId) return;
      button.disabled = true; button.textContent = '…';
      send({ type: 'remove_bot', botId });
    };
  });
  document.querySelectorAll('[data-team]').forEach(b => b.classList.toggle('active', b.dataset.team === mine?.team));
  document.querySelectorAll('[data-add-bot]').forEach(b => b.hidden = !mine?.host);
  document.querySelectorAll('[data-class]').forEach(b => b.classList.toggle('active', b.dataset.class === (mine?.tankClass || 'light')));
  startBtn.hidden = !mine?.host;
  mapSelect.disabled = !mine?.host;
  if (state.map && mapSelect.value !== state.map.id) mapSelect.value = state.map.id;
  modeSelect.disabled = !mine?.host;
  modeSelect.value = mode();
  const info = MODE_INFO[mode()] || MODE_INFO.teams;
  brBanner.innerHTML = `${info.icon} <b>${info.name}</b> : ${info.text(settings())}`;
  renderSettings(mine); renderColorPicker(mine); renderJoinCard();
  const fighters = groups.player.length + groups.yellow.length + groups.blue.length, needed = ffa ? 2 : 1;
  statusEl.textContent = mine?.host
    ? (fighters >= needed ? 'Le salon est prêt. Lance la partie quand tu veux.'
      : ffa ? 'Il faut au moins 2 participants (joueurs ou bots) dans ce mode.' : 'Ajoute au moins un joueur ou un bot dans une équipe.')
    : 'En attente du lancement par l’hôte.';
  startBtn.disabled = fighters < needed;
}

// Réglages de la partie (modifiables par l'hôte seulement).
function renderSettings(mine) {
  const s = settings(), host = !!mine?.host;
  const [key, label, min, max] = WIN_SETTING[mode()] || WIN_SETTING.teams;
  winsLabel.textContent = label; setWins.min = min; setWins.max = max; setWins.dataset.key = key;
  if (document.activeElement !== setWins) setWins.value = s[key];
  setWins.disabled = !host; setZone.disabled = !host; setZone.value = s.zoneSpeed || 'normal';
  zoneSetting.hidden = !isBR();
  settingsHint.textContent = host ? 'Tu es l’hôte : tu peux tout modifier.' : 'Seul l’hôte peut les modifier.';
  setPowers.innerHTML = Object.entries(POWER_INFO).map(([k, p]) =>
    `<button type="button" data-power="${k}" class="${s.powers?.[k] === false ? '' : 'on'}" style="--chip:${p.color}" ${host ? '' : 'disabled'}>${p.icon} ${p.name}</button>`).join('');
}
setWins.onchange = () => send({ type: 'settings', settings: { [setWins.dataset.key]: Number(setWins.value) } });
setZone.onchange = () => send({ type: 'settings', settings: { zoneSpeed: setZone.value } });
setPowers.onclick = event => {
  const b = event.target.closest('[data-power]');
  if (b && !b.disabled) send({ type: 'settings', settings: { powers: { [b.dataset.power]: !b.classList.contains('on') } } });
};

function renderColorPicker(mine) {
  colorPicker.innerHTML = PALETTE.map(col => `<button type="button" data-color="${col}" class="${mine?.prefColor === col ? 'active' : ''}" style="background:${col}" title="Couleur de ton char"></button>`).join('');
}
colorPicker.onclick = event => {
  const b = event.target.closest('[data-color]');
  if (!b) return;
  send({ type: 'style', color: b.dataset.color }); savePref('tankColor', b.dataset.color);
};

// Adresse à taper sur l'autre appareil + QR code (la bibliothèque QR vient d'Internet ; sans connexion, l'adresse suffit).
let qrDone = '', qrTries = 0;
function renderJoinCard() {
  const list = ADDRESSES.filter(a => !a.includes('127.0.0.1')), main = list[0];
  joinUrl.textContent = main || 'Aucun réseau détecté';
  joinOther.textContent = list.length > 1 ? `Si ça ne marche pas, essaie : ${list.slice(1).join(' · ')}` : 'Même Wi-Fi requis. Scanne le QR code ou tape l’adresse.';
  if (!main || qrDone === main) return;
  if (!window.QRCode) {
    qrBox.textContent = qrTries < 8 ? 'QR code…' : 'QR code indisponible hors ligne';
    if (qrTries++ < 8) setTimeout(() => { lobbySignature = ''; renderLobby(); }, 1000);
    return;
  }
  qrBox.innerHTML = '';
  new QRCode(qrBox, { text: main, width: 84, height: 84, colorDark: '#0d1410', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  qrDone = main;
}

function populateMaps(maps) {
  mapSelect.innerHTML = maps.map(m => `<option value="${m.id}">${escapeHtml(m.name)}${m.id === 'random' ? '' : ` · ${m.w}×${m.h}`}</option>`).join('');
  if (state.map) mapSelect.value = state.map.id;
}

function buildClassPicker() {
  const list = Object.values(CLASSES);
  const maxSpeed = Math.max(...list.map(s => s.speed));
  const minReload = Math.min(...list.map(s => s.reload));
  const maxPower = Math.max(...list.map(s => s.damage * s.bullet));
  const bar = (label, value) => `<div class="stat"><span>${label}</span><i><span style="width:${Math.round(Math.min(1, value) * 100)}%"></span></i></div>`;
  classGrid.innerHTML = Object.entries(CLASSES).map(([key, s]) => `
    <button type="button" class="class-card" data-class="${key}">
      <canvas width="128" height="128" data-class-icon="${key}"></canvas>
      <div><b>${s.name}</b><p>${CLASS_TEXT[key] || ''}</p>
        ${bar('Vie', s.hp / 5)}${bar('Vitesse', s.speed / maxSpeed)}${bar('Cadence', minReload / s.reload)}${bar('Puissance', (s.damage * s.bullet) / maxPower)}
      </div>
    </button>`).join('');
  classGrid.querySelectorAll('[data-class-icon]').forEach(canvas => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 128, 128); g.translate(64, 64); g.scale(2.6, 2.6); g.rotate(-Math.PI / 2);
    drawTankShape(g, canvas.dataset.classIcon, '#d8ef5a');
  });
  classGrid.querySelectorAll('[data-class]').forEach(b => b.onclick = () => {
    send({ type: 'tank_class', tankClass: b.dataset.class });
    savePref('tankClass', b.dataset.class);
  });
  lobbySignature = '';
}

// Aperçu miniature de la carte choisie dans le lobby.
let previewSignature = '';
function renderMapPreview() {
  if (!state.map || !mapPreview) return;
  const signature = `${state.map.id}-${state.map.version}-${state.gameMode}`;
  if (signature === previewSignature) return;
  previewSignature = signature;
  const g = mapPreview.getContext('2d'), m = state.map, t = m.theme || {};
  const s = Math.min(mapPreview.width / m.w, mapPreview.height / m.h);
  const ox = (mapPreview.width - m.w * s) / 2, oy = (mapPreview.height - m.h * s) / 2;
  g.clearRect(0, 0, mapPreview.width, mapPreview.height);
  g.fillStyle = t.floor || '#172119'; g.fillRect(ox, oy, m.w * s, m.h * s);
  for (const w of m.walls) {
    g.fillStyle = w.kind === 'crate' ? '#b07a43' : w.kind === 'ruin' ? '#9a6a4f' : (t.wall || '#7b5b3c');
    g.fillRect(ox + w.x * s, oy + w.y * s, Math.max(1.5, w.w * s), Math.max(1.5, w.h * s));
  }
  g.fillStyle = '#38bdf8';
  for (const tp of m.teleporters || []) for (const [px, py] of [[tp.ax, tp.ay], [tp.bx, tp.by]]) { g.beginPath(); g.arc(ox + px * s, oy + py * s, 3, 0, 7); g.fill(); }
  const cx = ox + m.w * s / 2, cy = oy + m.h * s / 2;
  if (isBR()) {
    g.strokeStyle = 'rgba(248,113,113,.8)'; g.setLineDash([4, 3]); g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, Math.min(m.w, m.h) * s * 0.42, 0, 7); g.stroke(); g.setLineDash([]);
  } else if (!isFFA()) {
    g.fillStyle = '#f1ce5c'; g.fillRect(ox + 4, oy + m.h * s / 2 - 6, 3, 12);
    g.fillStyle = '#83d2f6'; g.fillRect(ox + m.w * s - 7, oy + m.h * s / 2 - 6, 3, 12);
    if (mode() === 'koth') { g.strokeStyle = '#d8ef5a'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 95 * s, 0, 7); g.stroke(); }
  }
  if (m.random) {
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, mapPreview.width, mapPreview.height);
    g.fillStyle = '#fff'; g.font = '900 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', mapPreview.width / 2, mapPreview.height / 2);
  }
}

// =============================================================================
// Tableau des scores (touche Tab, écran d'amélioration et fin de partie)
// =============================================================================

const accuracy = p => p.shots ? (p.hits || 0) / p.shots : 0;
const STAT_HEAD = '<th class="n">Kills</th><th class="n">Morts</th><th class="n" title="Part des obus qui touchent un ennemi">Préc.</th><th class="n">Dégâts</th><th class="n">Bonus</th>';
const statCells = p => `<td class="n">${p.kills || 0}</td><td class="n">${p.deaths || 0}</td><td class="n">${p.shots ? Math.round(accuracy(p) * 100) + '%' : '–'}</td><td class="n">${p.dmg || 0}</td><td class="n">${p.pickups || 0}</td>`;
const nameCells = (p, crown) => `<td>${crown ? '👑 ' : ''}<span class="color-dot" style="background:${p.color || p.prefColor || '#888'}"></span>${escapeHtml(p.name)}${p.isBot ? ' <small>BOT</small>' : ''}${p.id === id ? ' <small>(toi)</small>' : ''}</td><td><small>${className(p.tankClass)}</small></td>`;

function ffaScoreHTML() {
  const elim = mode() === 'elim', s = settings(), info = MODE_INFO[mode()];
  const main = p => elim ? (p.lives || 0) : (p.brWins || 0);
  const list = players.filter(isFighter).sort((a, b) => main(b) - main(a) || (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0));
  const rows = list.map((p, i) => `<tr class="${p.id === id ? 'me' : ''}">${nameCells(p, i === 0 && main(p) > 0)}<td class="n">${elim ? ('♥'.repeat(Math.max(0, p.lives || 0)) || '💀') : main(p)}</td>${statCells(p)}</tr>`).join('');
  const goal = elim ? `${plural(s.elimLives, 'vie')} chacun` : `premier à ${plural(s.brWins, 'manche')}`;
  return `<section class="score-team br"><header><span>${info.icon} ${info.name}</span><em>${goal}</em></header>
    <table><thead><tr><th>Joueur</th><th>Char</th><th class="n">${elim ? 'Vies' : 'Manches'}</th>${STAT_HEAD}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

function teamScoreText(value) {
  if (mode() === 'koth') return `${value} s sur la colline`;
  if (mode() === 'ctf') return plural(value, 'capture');
  return plural(value, 'manche');
}

function scoreHTML() {
  if (isFFA()) return ffaScoreHTML();
  const teams = { yellow: [], blue: [] };
  for (const p of players) if (teams[p.team]) teams[p.team].push(p);
  return ['yellow', 'blue'].map((team, index) => {
    const list = teams[team].sort((a, b) => (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0));
    const totalKills = list.reduce((sum, p) => sum + (p.kills || 0), 0);
    const rows = list.map(p => `<tr class="${p.id === id ? 'me' : ''}">${nameCells(p, false)}${statCells(p)}</tr>`).join('');
    return `<section class="score-team ${team}">
      <header><span>Équipe ${TEAM_NAME[team]}</span><em>${teamScoreText(state.score?.[index] || 0)} · ${plural(totalKills, 'kill')}</em></header>
      ${list.length ? `<table><thead><tr><th>Joueur</th><th>Char</th>${STAT_HEAD}</tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Aucun joueur</div>'}
    </section>`;
  }).join('');
}

// Récompenses de fin de partie.
function awardsHTML() {
  const list = players.filter(isFighter);
  const best = (score, min = 1) => list.reduce((top, p) => score(p) >= min && (!top || score(p) > score(top)) ? p : top, null);
  const precise = p => (p.shots || 0) >= 5 ? accuracy(p) : -1;
  const items = [
    ['🎯', 'Meilleur tueur', best(p => p.kills || 0), p => plural(p.kills, 'kill')],
    ['🔫', 'Le plus précis', best(precise, 0), p => `${Math.round(accuracy(p) * 100)} % de tirs réussis`],
    ['💥', 'Plus de dégâts', best(p => p.dmg || 0), p => plural(p.dmg, 'dégât')],
    ['🎁', 'Chasseur de bonus', best(p => p.pickups || 0), p => `${p.pickups} bonus`],
  ];
  return items.filter(item => item[2]).map(([icon, label, p, text]) => `<div class="award"><i>${icon}</i><small>${label}</small><b>${escapeHtml(p.name)}</b><em>${text(p)}</em></div>`).join('');
}

let scoreSignature = '';
function renderScores() {
  const playing = state.mode === 'game';
  const prep = state.phase === 'prep';
  const matchOver = playing && !state.running;
  // Visible en maintenant Tab, et automatiquement à la fin de la partie.
  scoreOverlay.hidden = !(playing && !prep && (tabHeld || matchOver));
  const signature = JSON.stringify([players.map(p => [p.id, p.name, p.team, p.kills, p.deaths, p.tankClass, p.brWins, p.color, p.lives, p.shots, p.hits, p.dmg, p.pickups]), state.score, id, state.gameMode, matchOver]);
  if (signature === scoreSignature) return;
  scoreSignature = signature;
  overlayScore.classList.toggle('single', isFFA()); prepScore.classList.toggle('single', isFFA());
  const html = scoreHTML();
  overlayScore.innerHTML = html;
  prepScore.innerHTML = html;
  awardsEl.hidden = !matchOver;
  if (matchOver) awardsEl.innerHTML = awardsHTML();
}

// =============================================================================
// Phase d'amélioration
// =============================================================================

function renderUpgrades() {
  const mine = me(), prep = state.phase === 'prep';
  upgradePanel.hidden = !prep;
  arenaWrap.hidden = prep;
  const help = $('.help');
  if (help) help.hidden = prep;
  abandon.hidden = prep; abandonMatch.hidden = prep;
  abandon.textContent = isFFA() || isRespawn() ? 'S’autodétruire' : 'Abandonner la manche';
  if (!prep) return;
  prepTimer.textContent = Math.max(0, Math.ceil(state.prepTimer || 0));
  prepClass.textContent = isFighter(mine) ? `Ton char : ${className(mine.tankClass)}.` : '';
  const upgrades = mine?.upgrades || {};
  document.querySelectorAll('[data-upgrade]').forEach(button => {
    const level = upgrades[button.dataset.upgrade] || 0;
    const levels = button.querySelector('.levels');
    if (levels) levels.textContent = '●'.repeat(level) + '○'.repeat(3 - level);
    button.disabled = !!mine?.upgradeChosen || level >= 3;
  });
  upgradeStatus.textContent = mine?.upgradeChosen
    ? (isRespawn() ? 'Amélioration choisie. La partie commence dans quelques secondes.' : 'Amélioration choisie. Prochaine manche dans quelques secondes.')
    : 'Choisis une amélioration avant la fin du compte à rebours.';
}

// Le canvas garde les proportions de la carte et remplit la place disponible.
function fitArena() {
  if (arenaWrap.hidden || game.hidden) return;
  const availW = arenaWrap.clientWidth - 6, availH = arenaWrap.clientHeight - 6;
  if (availW <= 0 || availH <= 0) return;
  const s = Math.min(availW / worldW, availH / worldH);
  c.style.width = `${Math.floor(worldW * s) + 6}px`;
  c.style.height = `${Math.floor(worldH * s) + 6}px`;
}
new ResizeObserver(fitArena).observe(arenaWrap);

// =============================================================================
// Réseau
// =============================================================================

const shotSound = kind => kind === 'rocket' ? 'rocket' : kind === 'laser' ? 'laser' : 'shoot';

function onState(m) {
  const prev = state;
  const previousVersion = prev.map?.version;
  const previousBreakables = new Map((prev.map?.walls || []).filter(w => w.hp != null).map(w => [w.id, w]));
  const prevMine = (prev.tanks || []).find(t => t.id === id);
  const prevBullets = new Map((prev.bullets || []).map(b => [b.id, b.bounces || 0]));
  state = m.state; snapshotAt = performance.now(); players = m.players; mines = m.mines || [];
  const live = !firstSnapshot;   // au chargement de la page, on ignore ce qui s'est passé avant
  for (const e of state.explosions || []) {
    if (e.seq <= seenFxSeq) continue;
    seenFxSeq = e.seq;
    if (!live) continue;
    explosionAnims.push({ ...e, age: 0 });
    if (e.kind === 'blink') sfx('teleport'); else { sfx('explosion'); shake = Math.max(shake, 0.18); }
  }
  for (const e of state.pickups || []) {
    if (e.seq <= seenPickupSeq) continue;
    seenPickupSeq = e.seq;
    if (live) { pickupAnims.push({ x: e.x, y: e.y, type: e.type, mine: e.id === id, age: 0 }); sfx('pickup', e.id === id ? 1 : 0.35); }
  }
  for (const e of state.notices || []) {
    if (e.seq <= seenNoticeSeq) continue;
    seenNoticeSeq = e.seq;
    if (live) { noticeAnims.push({ text: e.text, color: e.color, age: 0 }); sfx('notice'); }
  }
  if (live) {
    for (const b of state.bullets || []) {
      if (!prevBullets.has(b.id)) sfx(shotSound(b.kind), b.owner === id ? 1 : 0.35);
      else if ((b.bounces || 0) > prevBullets.get(b.id)) sfx('bounce', 0.6);
    }
    const mineNow = state.tanks.find(t => t.id === id);
    if (prevMine && mineNow && mineNow.hp < prevMine.hp) { shake = 0.35; hurtFlash = 0.55; sfx('hit'); }
  }
  if (state.map) {
    const sizeChanged = worldW !== state.map.w || worldH !== state.map.h;
    worldW = state.map.w; worldH = state.map.h; walls = state.map.walls || []; theme = state.map.theme;
    if (c.width !== worldW) c.width = worldW;
    if (c.height !== worldH) c.height = worldH;
    if (sizeChanged) fitArena();
    if (previousVersion !== state.map.version) { tracks = []; wrecks = []; }
    // Une caisse ou une ruine a disparu sur la même carte : elle vient d'être détruite.
    else if (state.mode === 'game') {
      const present = new Set(walls.map(w => w.id));
      for (const [wallId, wall] of previousBreakables) if (!present.has(wallId)) { spawnDebris(wall); sfx('explosion', 0.4); }
    }
  }
  ingestKillEvents();
  renderLobby(); renderMapPreview(); renderUpgrades(); renderScores();
  const playing = state.mode === 'game';
  const wasHidden = game.hidden;
  lobby.hidden = playing; game.hidden = !playing;
  if (playing && wasHidden) { nameEl.blur(); c.focus(); requestAnimationFrame(fitArena); }
  if (playing && arenaWrap.dataset.shown !== '1' && !arenaWrap.hidden) requestAnimationFrame(fitArena);
  arenaWrap.dataset.shown = playing && !arenaWrap.hidden ? '1' : '0';
}

function connect() {
  clearTimeout(retry);
  net.textContent = 'Connexion...';
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => net.textContent = 'Connecté au LAN';
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'bot_removed') { statusEl.textContent = m.removed ? 'Bot supprimé.' : 'Impossible de supprimer ce bot.'; return; }
    if (m.type === 'full') { net.textContent = 'Salon complet'; statusEl.textContent = 'Le salon est complet.'; ws.close(); return; }
    if (m.type === 'welcome') {
      id = m.id;
      if (m.classes) { CLASSES = m.classes; buildClassPicker(); }
      if (m.maps) populateMaps(m.maps);
      if (m.palette) PALETTE = m.palette;
      if (m.addresses) ADDRESSES = m.addresses;
      lobbySignature = '';
      send({ type: 'name', name: nameEl.value || 'Joueur' });
      const savedClass = pref('tankClass', null), savedColor = pref('tankColor', null);
      if (savedClass && CLASSES[savedClass]) send({ type: 'tank_class', tankClass: savedClass });
      if (savedColor && PALETTE.includes(savedColor)) send({ type: 'style', color: savedColor });
    }
    if (m.type === 'state') onState(m);
  };
  ws.onclose = () => { if (net.textContent !== 'Salon complet') { net.textContent = 'Reconnexion...'; retry = setTimeout(connect, 1000); } };
  ws.onerror = () => ws.close();
}

// =============================================================================
// Boutons et fenêtre « ajouter un bot »
// =============================================================================

nameEl.onchange = () => send({ type: 'name', name: nameEl.value || 'Joueur' });
document.querySelectorAll('[data-team]').forEach(b => b.onclick = () => send({ type: 'team', team: b.dataset.team }));
mapSelect.onchange = () => send({ type: 'map', mapId: mapSelect.value });
modeSelect.onchange = () => send({ type: 'game_mode', gameMode: modeSelect.value });
startBtn.onclick = () => send({ type: 'start' });
abandon.onclick = () => send({ type: 'forfeit' });
abandonMatch.onclick = () => send({ type: 'abandon_match' });
document.querySelectorAll('[data-upgrade]').forEach(b => b.onclick = () => send({ type: 'upgrade', upgrade: b.dataset.upgrade }));

let pendingBotTeam = null, pendingBotClass = 'random';
function openBotModal(team) {
  pendingBotTeam = team; botModal.hidden = false;
  $('.modal-kicker').textContent = team === 'player' ? 'NOUVEL ADVERSAIRE' : 'NOUVEAU COÉQUIPIER';
  $('#botModalDescription').textContent = team === 'player'
    ? 'Le bot jouera chacun pour soi.'
    : `Le bot sera ajouté à l'équipe ${TEAM_NAME[team] || ''}.`;
  requestAnimationFrame(() => botModal.classList.add('visible'));
  $('[data-bot-level="normal"]')?.focus();
}
function closeBotPicker() {
  botModal.classList.remove('visible');
  setTimeout(() => { botModal.hidden = true; pendingBotTeam = null; }, 180);
}
document.addEventListener('click', event => {
  const add = event.target.closest('[data-add-bot]');
  if (add) { event.preventDefault(); openBotModal(add.dataset.addBot); }
});
document.querySelectorAll('[data-bot-class]').forEach(button => button.addEventListener('click', () => {
  pendingBotClass = button.dataset.botClass;
  document.querySelectorAll('[data-bot-class]').forEach(b => b.classList.toggle('active', b === button));
}));
document.querySelectorAll('[data-bot-level]').forEach(button => button.addEventListener('click', () => {
  if (pendingBotTeam) send({ type: 'bot', action: 'add', team: pendingBotTeam, difficulty: button.dataset.botLevel, tankClass: pendingBotClass === 'random' ? null : pendingBotClass });
  closeBotPicker();
}));
closeBotModal.onclick = cancelBotModal.onclick = closeBotPicker;
botModal.addEventListener('click', event => { if (event.target === botModal) closeBotPicker(); });
addEventListener('keydown', event => { if (event.key === 'Escape' && !botModal.hidden) closeBotPicker(); });

// =============================================================================
// Clavier et souris
// =============================================================================

const KEY_ALIASES = { arrowup: 'z', arrowdown: 's', arrowleft: 'q', arrowright: 'd', w: 'z', a: 'q' };
const controlKeys = new Set(['z', 'q', 's', 'd', ' ', 'e', 'f']);
function key(e) { const k = (e.key || '').toLowerCase(); return KEY_ALIASES[k] || k; }
function typingInField(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'); }

let previous = '', minePressed = false, tpPressed = false;
addEventListener('keydown', e => {
  if (e.key === 'Tab' && !game.hidden) { e.preventDefault(); tabHeld = true; renderScores(); return; }
  if (typingInField(e)) return; // permet d'écrire Z, Q, S, D ou espace dans le pseudo
  const k = key(e);
  if (controlKeys.has(k)) { keys[k] = true; e.preventDefault(); }
  // Mémorisés : même un appui très bref pose la mine / déclenche le téléport.
  if (k === 'e' && !e.repeat) minePressed = true;
  if (k === 'f' && !e.repeat) tpPressed = true;
}, { capture: true });
addEventListener('keyup', e => {
  if (e.key === 'Tab') { tabHeld = false; renderScores(); if (!game.hidden) e.preventDefault(); return; }
  const k = key(e);
  if (controlKeys.has(k)) { keys[k] = false; e.preventDefault(); }
}, { capture: true });
addEventListener('blur', () => { keys = {}; mouseDown = false; tabHeld = false; renderScores(); });

// Visée à la souris (option) : la tourelle suit le curseur, clic gauche pour tirer.
let mouseWorld = null, mouseDown = false;
c.addEventListener('mousemove', e => {
  const r = c.getBoundingClientRect(), border = (r.width - c.clientWidth) / 2;
  mouseWorld = { x: (e.clientX - r.left - border) * worldW / c.clientWidth, y: (e.clientY - r.top - border) * worldH / c.clientHeight };
});
c.addEventListener('mousedown', e => { if (mouseAim && e.button === 0) { mouseDown = true; e.preventDefault(); c.focus(); } });
addEventListener('mouseup', () => { mouseDown = false; });
c.addEventListener('contextmenu', e => { if (mouseAim) e.preventDefault(); });

setInterval(() => {
  const input = { f: !!keys.z, b: !!keys.s, l: !!keys.q, r: !!keys.d, shoot: !!keys[' '] || (mouseAim && mouseDown), mine: !!keys.e || minePressed, tp: !!keys.f || tpPressed };
  if (mouseAim && mouseWorld) {
    const t = state.tanks.find(tk => tk.id === id);
    if (t) input.aim = Math.round(Math.atan2(mouseWorld.y - t.y, mouseWorld.x - t.x) * 100) / 100;
  }
  const encoded = JSON.stringify(input), active = input.f || input.b || input.l || input.r || input.shoot || input.mine || input.tp;
  if (encoded !== previous || active) { send({ type: 'input', input }); previous = encoded; minePressed = false; tpPressed = false; }
}, 16);

// =============================================================================
// Dessin : sol et murs
// =============================================================================

function seeded(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// Le sol est pré-rendu une fois par carte (couleur, grille, décor du thème).
let floorCache = null, floorSignature = '';
function getFloor() {
  const signature = `${state.map?.id}-${state.map?.version}-${worldW}x${worldH}`;
  if (floorCache && signature === floorSignature) return floorCache;
  floorSignature = signature;
  floorCache = document.createElement('canvas');
  floorCache.width = worldW; floorCache.height = worldH;
  const g = floorCache.getContext('2d'), t = theme || {}, rnd = seeded((state.map?.version || 1) * 7919);
  g.fillStyle = t.floor || '#172119'; g.fillRect(0, 0, worldW, worldH);
  const style = t.style || 'carton';
  if (style === 'tree') {
    for (let i = 0; i < worldW * worldH / 900; i++) {
      g.fillStyle = rnd() < 0.5 ? '#ffffff06' : '#00000018';
      g.fillRect(rnd() * worldW, rnd() * worldH, 2 + rnd() * 3, 2 + rnd() * 3);
    }
  } else if (style === 'ice') {
    g.strokeStyle = '#ffffff12'; g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      let px = rnd() * worldW, py = rnd() * worldH; g.beginPath(); g.moveTo(px, py);
      for (let j = 0; j < 4; j++) { px += (rnd() - 0.5) * 90; py += (rnd() - 0.5) * 90; g.lineTo(px, py); }
      g.stroke();
    }
    const glare = g.createLinearGradient(0, 0, worldW, worldH);
    glare.addColorStop(0, '#ffffff0a'); glare.addColorStop(0.5, '#ffffff00'); glare.addColorStop(1, '#ffffff08');
    g.fillStyle = glare; g.fillRect(0, 0, worldW, worldH);
  } else if (style === 'stone') {
    for (let i = 0; i < worldW * worldH / 1400; i++) { g.fillStyle = rnd() < 0.5 ? '#ffffff07' : '#0000001a'; g.beginPath(); g.arc(rnd() * worldW, rnd() * worldH, 1 + rnd() * 2, 0, 7); g.fill(); }
  } else if (style === 'brick') {
    g.strokeStyle = '#ffffff10'; g.setLineDash([22, 18]); g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, worldH / 2); g.lineTo(worldW, worldH / 2); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 18; i++) { g.fillStyle = '#00000020'; g.beginPath(); g.ellipse(rnd() * worldW, rnd() * worldH, 20 + rnd() * 40, 10 + rnd() * 25, rnd() * 3, 0, 7); g.fill(); }
  } else if (style === 'metal') {
    g.strokeStyle = '#00000040'; g.lineWidth = 2;
    for (let a = 0; a < worldW; a += 120) { g.beginPath(); g.moveTo(a, 0); g.lineTo(a, worldH); g.stroke(); }
    for (let a = 0; a < worldH; a += 120) { g.beginPath(); g.moveTo(0, a); g.lineTo(worldW, a); g.stroke(); }
  } else if (style === 'concrete') {
    for (let i = 0; i < worldW * worldH / 2500; i++) { g.fillStyle = '#ffffff06'; g.fillRect(rnd() * worldW, rnd() * worldH, 2, 2); }
  }
  g.strokeStyle = t.grid || '#ffffff0b'; g.lineWidth = 1;
  for (let a = 0; a < worldW; a += 40) { g.beginPath(); g.moveTo(a, 0); g.lineTo(a, worldH); g.stroke(); }
  for (let a = 0; a < worldH; a += 40) { g.beginPath(); g.moveTo(0, a); g.lineTo(worldW, a); g.stroke(); }
  return floorCache;
}

function roundRect(g, rx, ry, rw, rh, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(rx, ry, rw, rh, r); else g.rect(rx, ry, rw, rh);
}

function drawCrate(w) {
  const ratio = Math.max(0, (w.hp ?? 3) / (w.maxHp || 3));
  x.save();
  x.fillStyle = ratio > 0.67 ? '#a8743f' : ratio > 0.34 ? '#8f6234' : '#74502b';
  x.fillRect(w.x, w.y, w.w, w.h);
  x.strokeStyle = '#d29a5d'; x.lineWidth = 3; x.strokeRect(w.x + 2.5, w.y + 2.5, w.w - 5, w.h - 5);
  x.strokeStyle = '#5c3d1f'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(w.x + 4, w.y + 4); x.lineTo(w.x + w.w - 4, w.y + w.h - 4); x.moveTo(w.x + w.w - 4, w.y + 4); x.lineTo(w.x + 4, w.y + w.h - 4); x.stroke();
  if (ratio < 1) { // fissures
    const rnd = seeded(w.id * 31 + 7);
    x.strokeStyle = '#1b120a'; x.lineWidth = 1.5;
    for (let i = 0; i < (ratio > 0.34 ? 2 : 4); i++) {
      let px = w.x + rnd() * w.w, py = w.y + rnd() * w.h; x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 3; j++) { px += (rnd() - 0.5) * 16; py += (rnd() - 0.5) * 16; x.lineTo(px, py); }
      x.stroke();
    }
  }
  x.restore();
}

function drawWall(w) {
  if (w.kind === 'crate') return drawCrate(w);
  if (w.kind === 'ruin') return drawRuin(w);
  const t = theme || {}, style = t.style || 'carton', fill = t.wall || '#7b5b3c', edge = t.edge || '#a9855e';
  x.save();
  if (style === 'tree') {
    if (Math.abs(w.w - w.h) < 8) {
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2, r = w.w / 2 + 2;
      x.fillStyle = '#0005'; x.beginPath(); x.arc(cx + 3, cy + 4, r, 0, 7); x.fill();
      x.fillStyle = fill; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      x.fillStyle = edge; x.globalAlpha = 0.55;
      for (const [dx, dy, rr] of [[-0.3, -0.3, 0.45], [0.3, -0.15, 0.35], [0, 0.3, 0.38]]) { x.beginPath(); x.arc(cx + dx * r, cy + dy * r, rr * r, 0, 7); x.fill(); }
    } else {
      roundRect(x, w.x, w.y, w.w, w.h, 10); x.fillStyle = fill; x.fill(); x.strokeStyle = edge; x.lineWidth = 2; x.stroke();
    }
  } else if (style === 'ice') {
    const grad = x.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    grad.addColorStop(0, edge); grad.addColorStop(1, fill);
    roundRect(x, w.x, w.y, w.w, w.h, 5); x.fillStyle = grad; x.globalAlpha = 0.9; x.fill();
    x.globalAlpha = 1; x.strokeStyle = '#ffffffaa'; x.lineWidth = 1.5; x.stroke();
    x.strokeStyle = '#ffffff70'; x.beginPath(); x.moveTo(w.x + 5, w.y + w.h * 0.6); x.lineTo(w.x + w.w * 0.5, w.y + 5); x.stroke();
  } else {
    x.fillStyle = '#0004'; x.fillRect(w.x + 3, w.y + 4, w.w, w.h);
    x.fillStyle = fill; x.fillRect(w.x, w.y, w.w, w.h);
    x.strokeStyle = edge; x.lineWidth = 1; x.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    if (style === 'metal') {
      x.fillStyle = edge;
      for (const [px, py] of [[5, 5], [w.w - 5, 5], [5, w.h - 5], [w.w - 5, w.h - 5]]) { x.beginPath(); x.arc(w.x + px, w.y + py, 1.8, 0, 7); x.fill(); }
    } else if (style === 'brick') {
      x.beginPath(); x.rect(w.x, w.y, w.w, w.h); x.clip(); x.strokeStyle = '#00000045'; x.lineWidth = 1;
      for (let row = 0, yy = w.y; yy < w.y + w.h; yy += 10, row++) {
        x.beginPath(); x.moveTo(w.x, yy); x.lineTo(w.x + w.w, yy); x.stroke();
        for (let xx = w.x + (row % 2 ? 10 : 0); xx < w.x + w.w; xx += 20) { x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx, yy + 10); x.stroke(); }
      }
    } else if (style === 'carton') {
      x.fillStyle = '#d9b98a22';
      if (w.w > w.h) x.fillRect(w.x, w.y + w.h / 2 - 3, w.w, 6); else x.fillRect(w.x + w.w / 2 - 3, w.y, 6, w.h);
    } else if (style === 'stone' || style === 'concrete') {
      x.fillStyle = '#ffffff12'; x.fillRect(w.x, w.y, w.w, 3);
    }
  }
  x.restore();
}

// =============================================================================
// Dessin : chars, obus, bonus, effets
// =============================================================================

function shade(hex, amount) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = v => Math.max(0, Math.min(255, v + amount));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// Dessine un char centré sur l'origine, canon vers +x. La tourelle peut tourner (turret, en radians)
// et prendre une autre couleur que la caisse (accent = couleur choisie par le joueur).
function drawTankShape(g, cls, color, turret = 0, accent = null) {
  const P = SHAPES[cls] || SHAPES.light, top = accent || color;
  g.fillStyle = '#2a302b';
  roundRect(g, -P.L / 2 - 2, -P.W / 2 - P.t, P.L + 4, P.t, 3); g.fill();
  roundRect(g, -P.L / 2 - 2, P.W / 2, P.L + 4, P.t, 3); g.fill();
  g.strokeStyle = '#ffffff18'; g.lineWidth = 1;
  for (let i = -P.L / 2 + 2; i < P.L / 2; i += 5) {
    g.beginPath(); g.moveTo(i, -P.W / 2 - P.t + 1); g.lineTo(i, -P.W / 2 - 1); g.moveTo(i, P.W / 2 + 1); g.lineTo(i, P.W / 2 + P.t - 1); g.stroke();
  }
  g.fillStyle = color; roundRect(g, -P.L / 2, -P.W / 2, P.L, P.W, 4); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.5; g.stroke();
  if (cls === 'heavy') { g.fillStyle = shade(color, -35); g.fillRect(-P.L / 2 + 3, -P.W / 2 + 3, 6, P.W - 6); }
  g.save(); g.rotate(turret);
  g.fillStyle = shade(top, -45);
  g.fillRect(0, -P.bw / 2, P.bl, P.bw);
  if (cls === 'heavy') g.fillRect(P.bl - 5, -P.bw / 2 - 2, 6, P.bw + 4);
  if (cls === 'sniper') g.fillRect(P.bl - 3, -P.bw / 2 - 1, 4, P.bw + 2);
  g.fillStyle = top; g.beginPath(); g.arc(0, 0, P.tr, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.stroke();
  if (cls === 'sniper') { g.fillStyle = '#1d2420'; g.fillRect(-3, -P.tr - 3, 10, 4); g.fillStyle = '#7dd3fc'; g.fillRect(5, -P.tr - 2.5, 2, 3); }
  g.restore();
}

// Laser de visée du sniper (uniquement sur son propre char) : trajectoire + premier ricochet.
function traceRay(px, py, dx, dy, maxLen) {
  let len = 0;
  while (len < maxLen) {
    const nx = px + dx * 4, ny = py + dy * 4;
    if (nx < 0 || nx > worldW) return { x: px, y: py, dx: -dx, dy, len };
    if (ny < 0 || ny > worldH) return { x: px, y: py, dx, dy: -dy, len };
    const w = walls.find(w => nx > w.x && nx < w.x + w.w && ny > w.y && ny < w.y + w.h);
    if (w) {
      if (w.hp != null) return { x: px, y: py, dx: 0, dy: 0, len, stop: true };
      const insideX = px > w.x && px < w.x + w.w;
      return insideX ? { x: px, y: py, dx, dy: -dy, len } : { x: px, y: py, dx: -dx, dy, len };
    }
    px = nx; py = ny; len += 4;
  }
  return { x: px, y: py, dx: 0, dy: 0, len, stop: true };
}
function drawAimLine(t) {
  const P = SHAPES.sniper, angle = t.ta ?? t.a, dx = Math.cos(angle), dy = Math.sin(angle);
  const sx = t.x + dx * P.bl, sy = t.y + dy * P.bl;
  const first = traceRay(sx, sy, dx, dy, 1400);
  x.save(); x.setLineDash([6, 6]); x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(255,90,90,.55)'; x.beginPath(); x.moveTo(sx, sy); x.lineTo(first.x, first.y); x.stroke();
  if (!first.stop) {
    const second = traceRay(first.x, first.y, first.dx, first.dy, 260);
    x.strokeStyle = 'rgba(255,90,90,.22)'; x.beginPath(); x.moveTo(first.x, first.y); x.lineTo(second.x, second.y); x.stroke();
  }
  x.restore();
}

function playerName(tankId) { return players.find(p => p.id === tankId)?.name || ''; }

function drawTank(t) {
  if (hiddenEnemy(t)) return;   // invisible pour l'ennemi
  const r = t.r || 17, now = performance.now();
  x.save();
  if (t.invis > 0) x.globalAlpha = 0.4 + Math.sin(now / 120) * 0.08;
  const pulse = killAnimations.find(a => a.id === t.id && a.age < .55);
  if (pulse) {
    const strength = 1 - pulse.age / .55;
    x.save(); x.strokeStyle = t.color; x.globalAlpha = strength * .85; x.lineWidth = 3 + strength * 5; x.shadowColor = t.color; x.shadowBlur = 22;
    x.beginPath(); x.arc(t.x, t.y, r + 12 + strength * 18, 0, Math.PI * 2); x.stroke(); x.restore();
  }
  if (t.shield > 0) {
    x.save(); x.strokeStyle = '#a78bfa'; x.shadowColor = '#a78bfa'; x.shadowBlur = 16; x.lineWidth = 4;
    x.beginPath(); x.arc(t.x, t.y, r + 11, 0, 7); x.stroke(); x.restore();
  } else if (t.spawnShield > 0) {
    x.save(); x.strokeStyle = '#ffffff'; x.globalAlpha *= 0.6; x.lineWidth = 2; x.setLineDash([4, 4]); x.lineDashOffset = now / 30;
    x.beginPath(); x.arc(t.x, t.y, r + 8, 0, 7); x.stroke(); x.restore();
  }
  if (t.id === id && t.cls === 'sniper') drawAimLine(t);
  drawTankBonusFx(t, now);
  x.save(); x.translate(t.x, t.y); x.rotate(t.a);
  drawTankShape(x, t.cls, t.color, (t.ta ?? t.a) - t.a, t.accent && t.accent !== t.color ? t.accent : null);
  x.restore();
  drawTankBonusIcons(t);

  // Barre de vie (une case par point de vie)
  const maxHp = t.maxHp || 3, barW = 2 * r + 8, barY = t.y - r - 14;
  x.fillStyle = '#111'; x.fillRect(t.x - barW / 2, barY, barW, 5);
  x.fillStyle = t.hp / maxHp > 0.34 ? '#6ee7b7' : '#f87171';
  x.fillRect(t.x - barW / 2, barY, barW * Math.max(0, t.hp) / maxHp, 5);
  if (maxHp <= 8) {
    x.fillStyle = '#111';
    for (let i = 1; i < maxHp; i++) x.fillRect(t.x - barW / 2 + barW * i / maxHp - 0.5, barY, 1, 5);
  }

  // Nom du joueur au-dessus du char
  const mine = t.id === id, name = playerName(t.id);
  if (name) {
    x.save(); x.font = `${mine ? 800 : 700} 12px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'bottom';
    const label = mine ? `▼ ${name}` : name;
    x.lineWidth = 4; x.lineJoin = 'round'; x.strokeStyle = 'rgba(8,12,9,.85)'; x.strokeText(label, t.x, barY - 3);
    x.fillStyle = mine ? '#ffffff' : t.color; x.fillText(label, t.x, barY - 3);
    x.restore();
  }
  x.restore();
}

// Les emojis passent par une police emoji explicite (sinon carré vide sur certains PC).
const ICON_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Segoe UI Symbol",system-ui,sans-serif';
// Les symboles simples (◆ » ∞) sont plus lisibles avec une police normale en gras.
const iconFont = (icon, size) => /\p{Extended_Pictographic}/u.test(icon) ? `${size}px ${ICON_FONT}` : `900 ${Math.round(size * 1.15)}px system-ui, sans-serif`;

function drawPowerup(p, now) {
  if (!p) return;
  const info = POWER_INFO[p.type] || POWER_INFO.speed;
  const bob = Math.sin(now / 260 + p.x) * 2.5, cx = p.x, cy = p.y + bob, k = screenScale();
  x.save();
  // Ombre au sol
  x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(p.x, p.y + 17, 13, 4, 0, 0, 7); x.fill();
  // Halo
  const halo = x.createRadialGradient(cx, cy, 6, cx, cy, 34);
  halo.addColorStop(0, info.color + '88'); halo.addColorStop(1, info.color + '00');
  x.fillStyle = halo; x.beginPath(); x.arc(cx, cy, 34, 0, 7); x.fill();
  // Disque sombre + anneau de couleur : l'icône reste lisible quelle que soit la couleur
  x.fillStyle = '#0d1410'; x.beginPath(); x.arc(cx, cy, 16, 0, 7); x.fill();
  x.strokeStyle = info.color; x.lineWidth = 3; x.shadowColor = info.color; x.shadowBlur = 14;
  x.beginPath(); x.arc(cx, cy, 16, 0, 7); x.stroke();
  // Anneau tournant
  x.shadowBlur = 0; x.lineWidth = 2; x.setLineDash([5, 6]); x.lineDashOffset = -now / 30;
  x.beginPath(); x.arc(cx, cy, 22, 0, 7); x.stroke(); x.setLineDash([]);
  // Icône
  x.fillStyle = info.color; x.font = iconFont(info.icon, 17); x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(info.icon, cx, cy + 1);
  // Nom (taille constante à l'écran)
  x.font = `800 ${Math.round(10 * k)}px system-ui`; x.textBaseline = 'top'; x.lineWidth = 3 * k; x.lineJoin = 'round'; x.strokeStyle = '#000b';
  x.strokeText(info.name, cx, cy + 25); x.fillStyle = info.color; x.fillText(info.name, cx, cy + 25);
  x.restore();
}

// Texte « + Roquette » qui s'envole quand un bonus est ramassé.
function drawPickups(dt) {
  const k = screenScale();
  for (const a of pickupAnims) {
    a.age += dt;
    const info = POWER_INFO[a.type] || POWER_INFO.speed, p = Math.min(1, a.age / 1.1);
    x.save(); x.globalAlpha = 1 - p;
    x.strokeStyle = info.color; x.lineWidth = 3 * (1 - p) + 1;
    x.beginPath(); x.arc(a.x, a.y, 16 + p * 40, 0, 7); x.stroke();
    x.font = `900 ${Math.round((a.mine ? 15 : 12) * k)}px system-ui`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 4 * k; x.lineJoin = 'round'; x.strokeStyle = '#000c';
    const label = `+ ${info.name}`, ty = a.y - 30 - p * 34;
    x.strokeText(label, a.x, ty); x.fillStyle = info.color; x.fillText(label, a.x, ty);
    x.restore();
  }
  pickupAnims = pickupAnims.filter(a => a.age < 1.1);
}

// Rapport pixels du monde / pixels à l'écran (le canvas est réduit pour tenir dans la fenêtre).
function screenScale() {
  const shown = c.clientWidth - 6;
  return shown > 0 ? Math.max(1, Math.min(3, c.width / shown)) : 1;
}

// Bonus actifs d'un char : [info, texte, temps restant (s) ou null, durée max].
function activeBonuses(t) {
  const list = [];
  const timed = (v, key, max) => { if (v > 0) list.push([POWER_INFO[key], `${POWER_INFO[key].name} ${Math.ceil(v)}s`, v, max]); };
  timed(t.speedBoost, 'speed', 6); timed(t.rapidFire, 'rapid', 6); timed(t.shield, 'shield', 8); timed(t.homing, 'homing', 6); timed(t.spread, 'spread', 6);
  if (t.rockets > 0) list.push([POWER_INFO.rocket, `Roquette ×${t.rockets}`, null, 0]);
  if (t.bouncy > 0) list.push([POWER_INFO.bouncy, `Rebond ×${t.bouncy}`, null, 0]);
  if (t.mines > 0) list.push([POWER_INFO.mine, `Mines ×${t.mines} (E)`, null, 0]);
  timed(t.invis, 'invis', 5); timed(t.magnet, 'magnet', 8);
  if (t.lasers > 0) list.push([POWER_INFO.laser, `Laser ×${t.lasers}`, null, 0]);
  if (t.teleports > 0) list.push([POWER_INFO.teleport, `Téléport ×${t.teleports} (F)`, null, 0]);
  return list;
}

// Effets visibles par tout le monde autour d'un char bonifié.
function drawTankBonusFx(t, now) {
  const r = t.r || 17;
  if (t.speedBoost > 0) {
    x.save(); x.strokeStyle = POWER_INFO.speed.color; x.lineCap = 'round'; x.globalAlpha = 0.75; x.lineWidth = 3;
    const back = t.a + Math.PI, side = t.a + Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const off = i * r * 0.55, len = 14 + Math.sin(now / 50 + i * 2) * 6;
      const bx = t.x + Math.cos(back) * (r + 4) + Math.cos(side) * off, by = t.y + Math.sin(back) * (r + 4) + Math.sin(side) * off;
      x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(back) * len, by + Math.sin(back) * len); x.stroke();
    }
    x.restore();
  }
  const auras = [];
  if (t.rapidFire > 0) auras.push(POWER_INFO.rapid.color);
  if (t.homing > 0) auras.push(POWER_INFO.homing.color);
  if (t.spread > 0) auras.push(POWER_INFO.spread.color);
  if (t.magnet > 0) auras.push(POWER_INFO.magnet.color);
  auras.forEach((color, i) => {
    x.save(); x.strokeStyle = color; x.lineWidth = 2.5; x.globalAlpha = 0.85; x.shadowColor = color; x.shadowBlur = 10;
    x.setLineDash([6, 8]); x.lineDashOffset = (i % 2 ? 1 : -1) * now / 25;
    x.beginPath(); x.arc(t.x, t.y, r + 6 + i * 4, 0, 7); x.stroke(); x.restore();
  });
}

// Petites icônes des bonus sous le char (visibles par tous).
function drawTankBonusIcons(t) {
  const list = activeBonuses(t);
  if (!list.length) return;
  const r = t.r || 17, size = 14, gap = 3, total = list.length * size + (list.length - 1) * gap;
  let px = t.x - total / 2 + size / 2;
  const py = t.y + r + 14;
  x.save(); x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [info] of list) {
    x.font = iconFont(info.icon, 10);
    x.fillStyle = '#0d1410e0'; x.beginPath(); x.arc(px, py, size / 2, 0, 7); x.fill();
    x.strokeStyle = info.color; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = info.color; x.fillText(info.icon, px, py + 0.5);
    px += size + gap;
  }
  x.restore();
}

function drawMine(m, now) {
  x.save(); x.translate(m.x, m.y);
  x.globalAlpha = m.hidden ? 0.42 : 1; // une mine « invisible » n'apparaît en transparence que chez son poseur
  x.strokeStyle = '#1f2937'; x.lineWidth = 3;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); x.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); x.stroke(); }
  x.fillStyle = '#374151'; x.beginPath(); x.arc(0, 0, 9, 0, 7); x.fill();
  x.strokeStyle = m.color; x.lineWidth = 2; x.stroke();
  const blink = m.armed ? Math.sin(now / 130) > 0 : true;
  x.fillStyle = m.armed ? (blink ? '#ef4444' : '#7f1d1d') : '#facc15';
  x.beginPath(); x.arc(0, 0, 3.2, 0, 7); x.fill();
  x.restore();
}

function drawExplosions(dt) {
  for (const e of explosionAnims) {
    e.age += dt;
    const p = Math.min(1, e.age / 0.6);
    x.save();
    if (e.kind === 'blink') {
      x.strokeStyle = `rgba(56,189,248,${1 - p})`; x.lineWidth = 3 * (1 - p) + 1;
      for (const [px, py] of [[e.x, e.y], [e.x2, e.y2]]) { x.beginPath(); x.arc(px, py, 10 + p * 26, 0, 7); x.stroke(); }
      x.setLineDash([4, 6]); x.globalAlpha = 0.6 * (1 - p); x.beginPath(); x.moveTo(e.x, e.y); x.lineTo(e.x2, e.y2); x.stroke();
    } else {
      const g = x.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (0.5 + p * 0.6));
      g.addColorStop(0, `rgba(255,240,180,${0.9 * (1 - p)})`); g.addColorStop(0.45, `rgba(251,146,60,${0.75 * (1 - p)})`); g.addColorStop(1, 'rgba(239,68,68,0)');
      x.fillStyle = g; x.beginPath(); x.arc(e.x, e.y, e.r * (0.5 + p * 0.6), 0, 7); x.fill();
      x.strokeStyle = `rgba(255,200,120,${1 - p})`; x.lineWidth = 4 * (1 - p) + 1;
      x.beginPath(); x.arc(e.x, e.y, e.r * p, 0, 7); x.stroke();
    }
    x.restore();
  }
  explosionAnims = explosionAnims.filter(e => e.age < 0.6);
}

function drawZone(now) {
  const z = state.zone;
  if (!z) return;
  x.save();
  x.beginPath(); x.rect(0, 0, worldW, worldH); x.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2, true);
  x.fillStyle = 'rgba(220,38,38,.20)'; x.fill('evenodd');
  x.strokeStyle = 'rgba(248,113,113,.9)'; x.lineWidth = 3; x.setLineDash([14, 10]); x.lineDashOffset = -now / 40;
  x.beginPath(); x.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2); x.stroke();
  x.restore();
}

// Grand texte au centre de l'arène (taille constante à l'écran).
function bigText(text, color, k, y = worldH / 2) {
  x.save(); x.font = `900 ${Math.round(28 * k)}px system-ui, ${ICON_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7 * k; x.lineJoin = 'round'; x.strokeStyle = '#000c'; x.strokeText(text, worldW / 2, y);
  x.fillStyle = color; x.fillText(text, worldW / 2, y); x.restore();
}

// Badges des bonus actifs de ton char, en haut à gauche (taille constante à l'écran).
function drawHud(now) {
  const k = screenScale(), mine = me();
  const pending = (state.respawns || []).find(r => r.id === id);
  if (pending) bigText(`Réapparition dans ${Math.max(1, Math.ceil(pending.t))} s`, '#ffffff', k);
  else if (mode() === 'elim' && state.phase === 'round' && state.running && isFighter(mine) && (mine.lives || 0) <= 0) bigText('💀 Éliminé ! Regarde la fin de la partie', '#fca5a5', k);
  const t = state.tanks.find(tk => tk.id === id);
  if (!t) return;
  const h = 28 * k, pad = 10 * k, chips = activeBonuses(t);
  if (Object.values(state.flags || {}).some(f => f.carrier === id)) chips.unshift([{ icon: '🚩', color: '#ffffff' }, 'Drapeau volé : rentre à ta base !', null, 0]);
  x.save(); x.font = `800 ${Math.round(13 * k)}px system-ui, ${ICON_FONT}`; x.textBaseline = 'middle'; x.textAlign = 'left';
  let px = 12 * k, py = 12 * k;
  for (const [info, label, left, max] of chips) {
    const text = `${info.icon} ${label}`, w = x.measureText(text).width + pad * 2;
    if (px + w > worldW - 12 * k) { px = 12 * k; py += h + 6 * k; }
    roundRect(x, px, py, w, h, h / 2); x.fillStyle = 'rgba(8,12,9,.8)'; x.fill();
    if (left != null && max) { // jauge du temps restant
      x.save(); x.clip(); x.fillStyle = info.color + '40'; x.fillRect(px, py, w * Math.min(1, left / max), h); x.restore();
    }
    roundRect(x, px, py, w, h, h / 2); x.strokeStyle = info.color; x.lineWidth = 2 * k; x.stroke();
    x.fillStyle = '#fff'; x.fillText(text, px + pad, py + h / 2 + 1);
    px += w + 6 * k;
  }
  x.restore();
  if (t.outside && state.zone) {
    x.save();
    x.fillStyle = `rgba(220,38,38,${0.18 + Math.sin(now / 120) * 0.08})`; x.fillRect(0, 0, worldW, worldH);
    bigText('⚠ HORS DE LA ZONE ⚠', '#fecaca', k * 0.95, py + h + 40 * k);
    // Flèche vers le centre de la zone
    const z = state.zone, a = Math.atan2(z.y - t.y, z.x - t.x), d = (t.r || 17) + 30 + Math.sin(now / 150) * 4;
    x.translate(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d); x.rotate(a); x.scale(k, k);
    x.fillStyle = '#fecaca'; x.strokeStyle = '#7f1d1d'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(14, 0); x.lineTo(-7, -10); x.lineTo(-2, 0); x.lineTo(-7, 10); x.closePath(); x.fill(); x.stroke();
    x.restore();
  }
}

function drawBullet(b) {
  const speed = Math.hypot(b.vx, b.vy) || 1, dx = b.vx / speed, dy = b.vy / speed;
  const kind = b.kind || 'normal';
  if (kind === 'rocket') {
    x.save(); x.translate(b.x, b.y); x.rotate(Math.atan2(dy, dx));
    const flame = x.createLinearGradient(-34, 0, -8, 0);
    flame.addColorStop(0, 'rgba(251,146,60,0)'); flame.addColorStop(1, 'rgba(253,224,71,.95)');
    x.fillStyle = flame; x.beginPath(); x.moveTo(-8, -4); x.lineTo(-30 - Math.random() * 8, 0); x.lineTo(-8, 4); x.fill();
    x.fillStyle = '#dc2626'; roundRect(x, -9, -4.5, 18, 9, 3); x.fill();
    x.fillStyle = '#f5f5f5'; x.beginPath(); x.moveTo(9, -4.5); x.lineTo(15, 0); x.lineTo(9, 4.5); x.fill();
    x.fillStyle = b.color; x.fillRect(-9, -6.5, 5, 13);
    x.restore(); return;
  }
  if (kind === 'laser') {
    const line = (len, width, color, blur) => {
      x.strokeStyle = color; x.lineWidth = width; x.shadowColor = color; x.shadowBlur = blur;
      x.beginPath(); x.moveTo(b.x - dx * len, b.y - dy * len); x.lineTo(b.x, b.y); x.stroke();
    };
    x.save(); x.lineCap = 'round';
    line(70, 9, 'rgba(244,63,94,.35)', 0); line(70, 4, '#f43f5e', 16); line(55, 1.5, '#ffffff', 0);
    x.restore(); return;
  }
  const color = kind === 'homing' ? '#f472b6' : kind === 'bouncy' ? '#e879f9' : (b.color || '#fff');
  const sniper = b.cls === 'sniper', heavy = b.cls === 'heavy';
  const tail = kind === 'bouncy' ? 54 : sniper ? 46 : 30;
  const size = kind === 'bouncy' ? 6.5 + Math.sin(performance.now() / 60) * 1.5 : heavy ? 7.5 : sniper ? 4.5 : 6;
  const g = x.createLinearGradient(b.x - dx * tail, b.y - dy * tail, b.x, b.y);
  g.addColorStop(0, 'transparent'); g.addColorStop(1, color);
  x.save(); x.strokeStyle = g; x.lineWidth = size + 1; x.lineCap = 'round';
  x.beginPath(); x.moveTo(b.x - dx * tail, b.y - dy * tail); x.lineTo(b.x, b.y); x.stroke();
  x.shadowColor = color; x.shadowBlur = 18; x.fillStyle = sniper ? '#fff' : color;
  x.beginPath(); x.arc(b.x, b.y, size, 0, 7); x.fill();
  if (kind !== 'normal') { x.fillStyle = '#fff'; x.beginPath(); x.arc(b.x, b.y, size * 0.45, 0, 7); x.fill(); }
  x.restore();
}

function spawnDebris(wall) {
  const ruin = wall.kind === 'ruin', color = ruin ? (theme?.wall || '#7b5b3c') : '#a8743f';
  for (let i = 0; i < (ruin ? 22 : 14); i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
    debris.push({ x: wall.x + wall.w / 2, y: wall.y + wall.h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - .5) * 12, size: 4 + Math.random() * 6, color, age: 0 });
  }
}
function drawDebris(dt) {
  for (const d of debris) {
    d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.92; d.vy *= 0.92; d.rot += d.vr * dt;
    x.save(); x.globalAlpha = Math.max(0, 1 - d.age / 0.9); x.translate(d.x, d.y); x.rotate(d.rot);
    x.fillStyle = d.color || '#a8743f'; x.fillRect(-d.size / 2, -d.size / 4, d.size, d.size / 2); x.restore();
  }
  debris = debris.filter(d => d.age < 0.9);
}

function lerpAngle(a, b, t) { const d = (b - a + Math.PI) % (Math.PI * 2) - Math.PI; return a + d * t; }
function smoothTanks(dt) {
  const present = new Set();
  for (const t of state.tanks) {
    present.add(t.id);
    let v = visualTanks.get(t.id);
    if (!v) { v = { ...t }; visualTanks.set(t.id, v); }
    const alpha = 1 - Math.exp(-dt * (t.id === id ? 22 : 14));
    v.x += (t.x - v.x) * alpha; v.y += (t.y - v.y) * alpha; v.a = lerpAngle(v.a, t.a, alpha);
    v.ta = lerpAngle(v.ta ?? t.ta ?? t.a, t.ta ?? t.a, Math.min(1, alpha * 1.5));
    const { x: sx, y: sy, a: sa, ta: sta } = v;
    Object.assign(v, t, { x: sx, y: sy, a: sa, ta: sta }); // toutes les infos (dont les bonus), position lissée
  }
  for (const k of visualTanks.keys()) if (!present.has(k)) visualTanks.delete(k);
  return [...visualTanks.values()];
}
function extrapolatedBullets() {
  const age = Math.min((performance.now() - snapshotAt) / 1000, .06);
  return state.bullets.map(b => ({ ...b, x: b.x + b.vx * age, y: b.y + b.vy * age }));
}

let firstSnapshot = true;
function ingestKillEvents() {
  const events = state.killEvents || [];
  // Au chargement de la page, on ignore les kills déjà en cours (pas de screamer « fantôme »).
  if (firstSnapshot) { firstSnapshot = false; for (const e of events) seenKillSeq = Math.max(seenKillSeq, e.seq); return; }
  for (const event of events) {
    if (event.seq <= seenKillSeq) continue;
    seenKillSeq = event.seq;
    if (!event.noKill) killAnimations.push({ id: event.id, kills: event.kills, x: event.x, y: event.y, color: event.color, age: 0 });
    if (event.wx != null) {
      wrecks.push({ x: event.wx, y: event.wy, cls: event.wcls, rot: Math.random() * 6.28, turret: Math.random() - 0.5, age: 0 });
      if (wrecks.length > 40) wrecks.shift();
    }
    sfx('death', event.victimId === id ? 1 : 0.6);
    if (event.victimId === id) triggerScreamer(); // seulement chez le joueur mort
  }
}
function drawKillAnimations(dt) {
  for (const a of killAnimations) {
    a.age += dt;
    const progress = Math.min(1, a.age / 1.25), rise = progress * 42, scale = 1 + Math.sin(progress * Math.PI) * .28;
    x.save(); x.globalAlpha = Math.max(0, 1 - progress); x.translate(a.x, a.y - 58 - rise); x.scale(scale, scale);
    x.textAlign = 'center'; x.font = '900 17px system-ui'; x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = '#101712';
    x.strokeText(`+1 KILL · ${a.kills}`, 0, 0);
    x.fillStyle = a.color; x.shadowColor = a.color; x.shadowBlur = 16; x.fillText(`+1 KILL · ${a.kills}`, 0, 0);
    x.restore();
  }
  killAnimations = killAnimations.filter(a => a.age < 1.25);
}

function renderWins(elementId, wins, team, max = 5, icon = '⚔') {
  const el = document.getElementById(elementId);
  const value = Math.max(0, Math.min(max, wins)), signature = `${team}-${value}-${max}-${icon}`;
  if (el.dataset.signature === signature) return;
  el.dataset.signature = signature;
  el.innerHTML = Array.from({ length: max }, (_, i) => `<span class="win-icon ${i < value ? 'won' : ''} ${i === value - 1 ? 'latest' : ''}" aria-hidden="true">${icon}</span>`).join('');
}

// Barre de progression (roi de la colline).
function renderBar(elementId, value, max, color) {
  const el = document.getElementById(elementId);
  const v = Math.max(0, Math.min(max, value)), signature = `bar-${v}-${max}-${color}`;
  if (el.dataset.signature === signature) return;
  el.dataset.signature = signature;
  el.innerHTML = `<div class="hill-bar"><span style="width:${(100 * v / max).toFixed(1)}%;background:${color}"></span><em>${v} / ${max} s</em></div>`;
}

function updateTopScore() {
  const s = settings(), m = mode();
  if (!isFFA()) {
    leftLabel.textContent = 'Équipe jaune'; rightLabel.textContent = 'Équipe bleue';
    if (m === 'koth') {
      renderBar('yellowWins', state.score[0] || 0, s.kothTime, '#ffd24d');
      renderBar('blueWins', state.score[1] || 0, s.kothTime, '#75d8ff');
    } else {
      const max = m === 'ctf' ? s.ctfCaps : s.teamsWins, icon = m === 'ctf' ? '🚩' : '⚔';
      renderWins('yellowWins', state.score[0] || 0, 'yellow', max, icon);
      renderWins('blueWins', state.score[1] || 0, 'blue', max, icon);
    }
    return;
  }
  const mine = me(), elim = m === 'elim';
  const fighters = players.filter(isFighter), main = p => elim ? (p.lives || 0) : (p.brWins || 0);
  const leader = fighters.sort((a, b) => main(b) - main(a) || (b.kills || 0) - (a.kills || 0))[0];
  leftLabel.textContent = mine && fighters.includes(mine) ? (elim ? 'Tes vies' : 'Tes manches') : 'Spectateur';
  rightLabel.textContent = leader ? `Meneur : ${leader.name}` : 'Meneur';
  const max = elim ? s.elimLives : s.brWins, icon = elim ? '♥' : '⚔';
  renderWins('yellowWins', mine ? main(mine) : 0, `${m}-me`, max, icon);
  renderWins('blueWins', leader ? main(leader) : 0, `${m}-lead`, max, icon);
}

function statusLine() {
  const s = settings(), ice = state.map?.ice ? ' · ❄ Sol glissant !' : '';
  if (state.phase === 'prep') return isRespawn() ? `La partie commence dans ${Math.max(0, Math.ceil(state.prepTimer || 0))} s` : `Prochaine manche dans ${Math.max(0, Math.ceil(state.prepTimer || 0))} s`;
  const win = players.find(p => p.id === state.winner)?.name;
  if (!state.running) {
    if (state.winnerTeam) return `L'équipe ${TEAM_NAME[state.winnerTeam]} gagne la partie ! Retour au lobby...`;
    return win ? `${win} gagne la partie ! Retour au lobby...` : 'Partie terminée ! Retour au lobby...';
  }
  if (win) return `${win} gagne la manche`;
  if (isBR() && state.zone) {
    const z = state.zone;
    const zoneText = z.t < z.delay ? `zone dans ${Math.ceil(z.delay - z.t)} s` : z.r > z.endR + 1 ? 'la zone rétrécit !' : 'zone finale';
    return `👑 ${state.tanks.length} en vie · ${zoneText}${ice}`;
  }
  if (mode() === 'koth') return `⛰ Colline : jaune ${state.score[0] || 0} s · bleue ${state.score[1] || 0} s (objectif ${s.kothTime} s)${ice}`;
  if (mode() === 'ctf') return `🚩 Captures : jaune ${state.score[0] || 0} – ${state.score[1] || 0} bleue (objectif ${s.ctfCaps})${ice}`;
  if (mode() === 'elim') return `💀 ${players.filter(p => isFighter(p) && (p.lives || 0) > 0).length} joueurs encore en lice${ice}`;
  return `Ramasse les bonus · E mine · F téléport${ice}`;
}

function draw(now = performance.now()) {
  const dt = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  if (!game.hidden) {
    x.save();
    if (shake > 0) { const m = shake * 18; x.translate((Math.random() - .5) * m, (Math.random() - .5) * m); shake = Math.max(0, shake - dt); }
    x.drawImage(getFloor(), 0, 0);
    drawTracks(dt);
    drawWrecks(dt);
    drawTeleporters(now);
    drawHill(now);
    for (const w of walls) drawWall(w);
    drawFlagBases();
    for (const m of mines) drawMine(m, now);
    for (const p of state.powerups || []) drawPowerup(p, now);
    const tanks = smoothTanks(dt);
    updateTracks(tanks.filter(t => !hiddenEnemy(t)));
    tanks.forEach(drawTank);
    drawFlags(now);
    extrapolatedBullets().forEach(drawBullet);
    drawExplosions(dt);
    drawZone(now);
    drawPickups(dt);
    drawDebris(dt);
    drawKillAnimations(dt);
    x.restore();
    drawHud(now);
    drawNotices(dt);
    if (hurtFlash > 0) {
      const g = x.createRadialGradient(worldW / 2, worldH / 2, Math.min(worldW, worldH) * 0.25, worldW / 2, worldH / 2, Math.max(worldW, worldH) * 0.7);
      g.addColorStop(0, 'rgba(220,38,38,0)'); g.addColorStop(1, `rgba(220,38,38,${Math.min(0.6, hurtFlash)})`);
      x.fillStyle = g; x.fillRect(0, 0, worldW, worldH); hurtFlash = Math.max(0, hurtFlash - dt * 1.6);
    }
    updateTopScore();
    $('#message').textContent = statusLine();
  }
  requestAnimationFrame(draw);
}

// =============================================================================
// Screamer
// Pour utiliser ta propre image : place « screamer.png » (ou .jpg / .gif / .webp)
// dans le dossier public. Sinon un visage effrayant est dessiné automatiquement.
// =============================================================================

const screamerEl = $('#screamer'), screamerImg = $('#screamerImg'), screamerToggle = $('#screamerToggle');
let audioCtx = null, screamerTimer = null;

try { screamerToggle.checked = localStorage.getItem('screamer') !== 'off'; } catch (_) {}
screamerToggle.onchange = () => { try { localStorage.setItem('screamer', screamerToggle.checked ? 'on' : 'off'); } catch (_) {} };

function loadScreamerImage() {
  const candidates = ['screamer.png', 'screamer.jpg', 'screamer.gif', 'screamer.webp'];
  const tryNext = i => {
    if (i >= candidates.length) { screamerImg.src = drawScaryFace(); return; }
    const probe = new Image();
    probe.onload = () => { screamerImg.src = probe.src; };
    probe.onerror = () => tryNext(i + 1);
    probe.src = candidates[i];
  };
  tryNext(0);
}

function drawScaryFace() {
  const S = 800, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), rnd = seeded(666);
  const bg = g.createRadialGradient(S / 2, S / 2, 50, S / 2, S / 2, S * 0.7);
  bg.addColorStop(0, '#3a0000'); bg.addColorStop(1, '#000'); g.fillStyle = bg; g.fillRect(0, 0, S, S);
  // Visage
  const face = g.createRadialGradient(S / 2, S * 0.4, 40, S / 2, S / 2, 360);
  face.addColorStop(0, '#d9d6c4'); face.addColorStop(0.6, '#8f8d7c'); face.addColorStop(1, '#2a2a22');
  g.fillStyle = face; g.beginPath(); g.ellipse(S / 2, S * 0.52, 290, 380, 0, 0, 7); g.fill();
  // Orbites creuses + pupilles rouges
  for (const side of [-1, 1]) {
    const ex = S / 2 + side * 120, ey = S * 0.38;
    const socket = g.createRadialGradient(ex, ey, 10, ex, ey, 110);
    socket.addColorStop(0, '#000'); socket.addColorStop(0.7, '#000'); socket.addColorStop(1, '#0000');
    g.fillStyle = socket; g.beginPath(); g.ellipse(ex, ey, 105, 85, side * 0.25, 0, 7); g.fill();
    g.shadowColor = '#f00'; g.shadowBlur = 40; g.fillStyle = '#ff2a1a';
    g.beginPath(); g.arc(ex + side * 6, ey + 8, 13, 0, 7); g.fill(); g.shadowBlur = 0;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + side * 6 - 4, ey + 4, 3, 0, 7); g.fill();
    // Larmes de sang
    g.strokeStyle = '#7a0000'; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const sx = ex - 40 + rnd() * 80; g.lineWidth = 6 + rnd() * 8;
      g.beginPath(); g.moveTo(sx, ey + 60); g.lineTo(sx + (rnd() - 0.5) * 20, ey + 140 + rnd() * 220); g.stroke();
    }
  }
  // Bouche béante avec des dents irrégulières
  const mx = S / 2, my = S * 0.74;
  g.fillStyle = '#000'; g.beginPath(); g.ellipse(mx, my, 150, 175, 0, 0, 7); g.fill();
  const throat = g.createRadialGradient(mx, my + 30, 5, mx, my, 150);
  throat.addColorStop(0, '#4a0000'); throat.addColorStop(1, '#0000');
  g.fillStyle = throat; g.beginPath(); g.ellipse(mx, my, 140, 165, 0, 0, 7); g.fill();
  g.fillStyle = '#e9e2c8';
  for (let i = 0; i < 9; i++) {
    const tx = mx - 130 + i * 32, top = my - 175 * Math.sqrt(Math.max(0, 1 - ((tx - mx) / 150) ** 2));
    g.beginPath(); g.moveTo(tx - 13, top + 6); g.lineTo(tx + 13, top + 6); g.lineTo(tx + rnd() * 6, top + 55 + rnd() * 35); g.fill();
    const bot = my + 175 * Math.sqrt(Math.max(0, 1 - ((tx - mx) / 150) ** 2));
    g.beginPath(); g.moveTo(tx - 12, bot - 6); g.lineTo(tx + 12, bot - 6); g.lineTo(tx + rnd() * 6, bot - 45 - rnd() * 30); g.fill();
  }
  // Fissures
  g.strokeStyle = '#1a1a14'; g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    let px = S / 2 + (rnd() - 0.5) * 460, py = S * 0.2 + rnd() * 500; g.beginPath(); g.moveTo(px, py);
    for (let j = 0; j < 5; j++) { px += (rnd() - 0.5) * 70; py += (rnd() - 0.5) * 70; g.lineTo(px, py); }
    g.stroke();
  }
  // Grain
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 50; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return cv.toDataURL('image/jpeg', 0.85);
}

// Le navigateur n'autorise le son qu'après une action du joueur : on prépare l'audio au premier appui.
function unlockAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; } }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
addEventListener('keydown', unlockAudio, { capture: true });
addEventListener('pointerdown', unlockAudio, { capture: true });

function playScream() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime, dur = 1.25;
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.55, t0 + 0.03);
  master.gain.setValueAtTime(0.55, t0 + dur - 0.35);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const shaper = audioCtx.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const v = i / 512 - 1; curve[i] = Math.tanh(v * 4); }
  shaper.curve = curve; shaper.connect(master); master.connect(audioCtx.destination);
  // Cri : oscillateurs désaccordés qui glissent vers le grave, avec un vibrato nerveux.
  for (const [type, base] of [['sawtooth', 920], ['square', 1385], ['sawtooth', 610]]) {
    const osc = audioCtx.createOscillator(), lfo = audioCtx.createOscillator(), lfoGain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(base, t0); osc.frequency.exponentialRampToValueAtTime(base * 0.45, t0 + dur);
    lfo.frequency.value = 13; lfoGain.gain.value = base * 0.06; lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    const gain = audioCtx.createGain(); gain.gain.value = 0.22; osc.connect(gain); gain.connect(shaper);
    osc.start(t0); lfo.start(t0); osc.stop(t0 + dur); lfo.stop(t0 + dur);
  }
  // Souffle (bruit blanc filtré)
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), ng = audioCtx.createGain();
  noise.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = 2200; filter.Q.value = 0.8; ng.gain.value = 0.5;
  noise.connect(filter); filter.connect(ng); ng.connect(shaper); noise.start(t0);
}

function triggerScreamer() {
  if (!screamerToggle.checked) return;
  clearTimeout(screamerTimer);
  screamerEl.hidden = false;
  screamerEl.classList.remove('play'); void screamerEl.offsetWidth; screamerEl.classList.add('play');
  playScream();
  screamerTimer = setTimeout(() => { screamerEl.hidden = true; screamerEl.classList.remove('play'); }, 1400);
}

// =============================================================================
// Éléments de jeu : ruines, téléporteurs, colline, drapeaux, traces, épaves, annonces
// =============================================================================

// Un char ennemi invisible n'est pas dessiné (les spectateurs voient tout).
function hiddenEnemy(t) {
  if (!(t.invis > 0) || t.id === id) return false;
  const mine = me();
  if (!isFighter(mine)) return false;
  if (isFFA()) return true;
  const myColor = state.tanks.find(tk => tk.id === id)?.color || TEAM_COLOR[mine.team];
  return t.color !== myColor;
}

// Mur en ruine : se fissure puis s'effondre sous les tirs.
function drawRuin(w) {
  drawWall({ ...w, kind: 'wall' });
  const ratio = Math.max(0, (w.hp ?? 6) / (w.maxHp || 6)), rnd = seeded(w.id * 53 + 11);
  x.save(); x.beginPath(); x.rect(w.x, w.y, w.w, w.h); x.clip();
  x.fillStyle = `rgba(0,0,0,${0.1 + (1 - ratio) * 0.35})`; x.fillRect(w.x, w.y, w.w, w.h);
  x.strokeStyle = '#140d08'; x.lineWidth = 1.5;
  for (let i = 0; i < 2 + Math.round((1 - ratio) * 6); i++) {
    let px = w.x + rnd() * w.w, py = w.y + rnd() * w.h; x.beginPath(); x.moveTo(px, py);
    for (let j = 0; j < 4; j++) { px += (rnd() - 0.5) * 18; py += (rnd() - 0.5) * 18; x.lineTo(px, py); }
    x.stroke();
  }
  x.restore();
  // Coins ébréchés : on reconnaît d'un coup d'œil un mur cassable.
  x.save(); x.fillStyle = theme?.floor || '#172119';
  x.beginPath(); x.moveTo(w.x, w.y); x.lineTo(w.x + 9, w.y); x.lineTo(w.x, w.y + 7); x.fill();
  x.beginPath(); x.moveTo(w.x + w.w, w.y + w.h); x.lineTo(w.x + w.w - 9, w.y + w.h); x.lineTo(w.x + w.w, w.y + w.h - 7); x.fill();
  x.restore();
}

function drawTeleporters(now) {
  for (const tp of state.map?.teleporters || []) for (const [px, py] of [[tp.ax, tp.ay], [tp.bx, tp.by]]) {
    x.save(); x.translate(px, py);
    const g = x.createRadialGradient(0, 0, 2, 0, 0, 28);
    g.addColorStop(0, 'rgba(56,189,248,.55)'); g.addColorStop(1, 'rgba(56,189,248,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 28, 0, 7); x.fill();
    x.rotate(now / 400); x.strokeStyle = '#38bdf8'; x.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(0, 0, 8 + i * 5, i * 2, i * 2 + Math.PI * 1.2); x.stroke(); }
    x.restore();
  }
}

function drawHill(now) {
  const h = state.hill;
  if (!h) return;
  const col = h.contested ? '#ffffff' : h.owner ? TEAM_COLOR[h.owner] : '#d8ef5a', goal = h.goal || 60;
  x.save();
  x.globalAlpha = h.contested ? 0.16 + Math.sin(now / 90) * 0.08 : 0.14; x.fillStyle = col;
  x.beginPath(); x.arc(h.x, h.y, h.r, 0, 7); x.fill();
  x.globalAlpha = 0.9; x.strokeStyle = col; x.lineWidth = 3; x.setLineDash([10, 8]); x.lineDashOffset = now / 60;
  x.beginPath(); x.arc(h.x, h.y, h.r, 0, 7); x.stroke();
  // Progression de chaque équipe autour de la colline : jaune à gauche, bleue à droite.
  x.setLineDash([]); x.lineWidth = 6; x.lineCap = 'round';
  x.strokeStyle = '#ffd24d'; x.beginPath(); x.arc(h.x, h.y, h.r + 9, -Math.PI / 2, -Math.PI / 2 - Math.PI * Math.min(1, h.time[0] / goal), true); x.stroke();
  x.strokeStyle = '#75d8ff'; x.beginPath(); x.arc(h.x, h.y, h.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * Math.min(1, h.time[1] / goal)); x.stroke();
  x.font = `900 13px system-ui, ${ICON_FONT}`; x.textAlign = 'center'; x.textBaseline = 'bottom'; x.lineWidth = 4; x.strokeStyle = '#000b';
  const label = h.contested ? '⚔ CONTESTÉE' : h.owner ? `⛰ ÉQUIPE ${TEAM_NAME[h.owner].toUpperCase()}` : '⛰ COLLINE';
  x.strokeText(label, h.x, h.y - h.r - 16); x.fillStyle = col; x.fillText(label, h.x, h.y - h.r - 16);
  x.restore();
}

function drawFlagIcon(fx, fy, color, now, carried) {
  x.save(); x.translate(fx + (carried ? 8 : 0), fy - (carried ? 12 : 0));
  x.strokeStyle = '#e5e7eb'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, 12); x.lineTo(0, -22); x.stroke();
  const wave = Math.sin(now / 150) * 3;
  x.fillStyle = color; x.beginPath(); x.moveTo(0, -22); x.quadraticCurveTo(10, -24 + wave, 20, -16); x.quadraticCurveTo(10, -10 + wave, 0, -8); x.closePath(); x.fill();
  x.strokeStyle = '#0009'; x.lineWidth = 1; x.stroke();
  x.restore();
}

function drawFlagBases() {
  for (const f of Object.values(state.flags || {})) {
    const col = TEAM_COLOR[f.team];
    x.save(); x.strokeStyle = col; x.globalAlpha = 0.75; x.lineWidth = 2; x.setLineDash([6, 5]);
    x.beginPath(); x.arc(f.homeX, f.homeY, 40, 0, 7); x.stroke();
    x.setLineDash([]); x.globalAlpha = 0.1; x.fillStyle = col; x.fill();
    x.restore();
  }
}

function drawFlags(now) {
  for (const f of Object.values(state.flags || {})) {
    const col = TEAM_COLOR[f.team];
    let fx = f.x, fy = f.y;
    if (f.carrier) { const v = visualTanks.get(f.carrier); if (v) { fx = v.x; fy = v.y; } }
    drawFlagIcon(fx, fy, col, now, !!f.carrier);
    const home = Math.hypot(f.x - f.homeX, f.y - f.homeY) < 1;
    if (!f.carrier && !home) {
      x.save(); x.font = '800 11px system-ui'; x.textAlign = 'center'; x.lineWidth = 3; x.strokeStyle = '#000b';
      const label = `retour ${Math.ceil(f.dropTimer)} s`;
      x.strokeText(label, f.x, f.y + 26); x.fillStyle = col; x.fillText(label, f.x, f.y + 26); x.restore();
    }
  }
}

// Traces de chenilles : un repère tous les 7 px, qui s'efface en 7 s.
function updateTracks(list) {
  for (const v of list) {
    const last = v.lastMark;
    if (!last || Math.hypot(v.x - last.x, v.y - last.y) > 7) {
      tracks.push({ x: v.x, y: v.y, a: v.a, w: (SHAPES[v.cls] || SHAPES.light).W, age: 0 });
      v.lastMark = { x: v.x, y: v.y };
    }
  }
  if (tracks.length > 900) tracks.splice(0, tracks.length - 900);
}
function drawTracks(dt) {
  x.save(); x.fillStyle = '#000';
  for (const m of tracks) {
    m.age += dt; x.globalAlpha = Math.max(0, 0.22 * (1 - m.age / 7));
    const ca = Math.cos(m.a), sa = Math.sin(m.a), off = m.w / 2 + 3;
    x.fillRect(m.x - sa * off - 2, m.y + ca * off - 2, 4, 4);
    x.fillRect(m.x + sa * off - 2, m.y - ca * off - 2, 4, 4);
  }
  x.restore();
  tracks = tracks.filter(m => m.age < 7);
}

// Épaves calcinées des chars détruits (restent jusqu'à la fin de la manche).
function drawWrecks(dt) {
  for (const w of wrecks) {
    w.age += dt;
    x.save(); x.translate(w.x, w.y);
    const g = x.createRadialGradient(0, 0, 2, 0, 0, 32);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 32, 0, 7); x.fill();
    x.save(); x.rotate(w.rot); x.globalAlpha = 0.75; drawTankShape(x, w.cls, '#3a3f3b', w.turret, '#2c302d'); x.restore();
    if (w.age < 5) { // fumée
      for (let i = 0; i < 3; i++) {
        const rise = (w.age * 22 + i * 9) % 30;
        x.globalAlpha = 0.28 * (1 - w.age / 5) * (1 - rise / 30); x.fillStyle = '#9ca3af';
        x.beginPath(); x.arc(Math.sin(w.age * 2 + i) * 5, -8 - rise, 5 + rise * 0.25, 0, 7); x.fill();
      }
    }
    x.restore();
  }
}

// Annonces au centre de l'écran (drapeau volé, colline prise...).
function drawNotices(dt) {
  const k = screenScale(); let y = worldH * 0.2;
  for (const n of noticeAnims) {
    n.age += dt;
    x.save(); x.globalAlpha = Math.max(0, Math.min(1, (2.6 - n.age) * 2));
    x.font = `900 ${Math.round(19 * k)}px system-ui, ${ICON_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6 * k; x.lineJoin = 'round'; x.strokeStyle = '#000c'; x.strokeText(n.text, worldW / 2, y);
    x.fillStyle = n.color; x.fillText(n.text, worldW / 2, y);
    x.restore(); y += 30 * k;
  }
  noticeAnims = noticeAnims.filter(n => n.age < 2.6);
}

// =============================================================================
// Sons (générés par le navigateur, aucun fichier audio)
// =============================================================================

let sfxBusNode = null;
const sfxLast = {};
function sfxBus() {
  if (!sfxBusNode) { sfxBusNode = audioCtx.createGain(); sfxBusNode.gain.value = 0.6; sfxBusNode.connect(audioCtx.destination); }
  return sfxBusNode;
}
function tone(t0, { type = 'square', f = 440, f2 = null, dur = 0.1, vol = 0.2 }) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(sfxBus()); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, { dur = 0.2, vol = 0.3, f = 1000, f2 = null, type = 'bandpass', q = 1 }) {
  const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur)), buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
  src.buffer = buffer; filter.type = type; filter.frequency.setValueAtTime(f, t0); if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t0 + dur); filter.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter); filter.connect(g); g.connect(sfxBus()); src.start(t0); src.stop(t0 + dur);
}
const SOUNDS = {
  shoot:     (t, v) => { tone(t, { f: 420, f2: 120, dur: 0.09, vol: 0.09 * v }); noise(t, { dur: 0.06, vol: 0.12 * v, f: 2500 }); },
  laser:     (t, v) => tone(t, { type: 'sawtooth', f: 1800, f2: 260, dur: 0.16, vol: 0.08 * v }),
  rocket:    (t, v) => { noise(t, { dur: 0.35, vol: 0.2 * v, f: 600, f2: 200, type: 'lowpass' }); tone(t, { type: 'sawtooth', f: 160, f2: 80, dur: 0.3, vol: 0.06 * v }); },
  bounce:    (t, v) => tone(t, { type: 'triangle', f: 1300, f2: 900, dur: 0.05, vol: 0.06 * v }),
  explosion: (t, v) => { noise(t, { dur: 0.7, vol: 0.5 * v, f: 900, f2: 60, type: 'lowpass' }); tone(t, { type: 'sine', f: 110, f2: 35, dur: 0.5, vol: 0.3 * v }); },
  pickup:    (t, v) => [660, 880, 1320].forEach((f, i) => tone(t + i * 0.06, { type: 'triangle', f, dur: 0.09, vol: 0.12 * v })),
  hit:       (t, v) => { noise(t, { dur: 0.14, vol: 0.35 * v, f: 1800 }); tone(t, { f: 220, f2: 90, dur: 0.14, vol: 0.1 * v }); },
  death:     (t, v) => { noise(t, { dur: 0.9, vol: 0.45 * v, f: 500, f2: 50, type: 'lowpass' }); tone(t, { type: 'sawtooth', f: 180, f2: 40, dur: 0.7, vol: 0.12 * v }); },
  teleport:  (t, v) => tone(t, { type: 'sine', f: 300, f2: 1600, dur: 0.22, vol: 0.15 * v }),
  notice:    (t, v) => [523, 659, 784].forEach((f, i) => tone(t + i * 0.08, { f, dur: 0.1, vol: 0.06 * v })),
};
function sfx(name, vol = 1) {
  if (!soundOn || !audioCtx || audioCtx.state !== 'running' || game.hidden) return;
  const t = audioCtx.currentTime;
  if (sfxLast[name] && t - sfxLast[name] < 0.035) return;   // évite la cacophonie (tir x5, rafales)
  sfxLast[name] = t;
  try { SOUNDS[name]?.(t, vol); } catch (_) {}
}


loadScreamerImage();
buildClassPicker();
connect();
draw();
