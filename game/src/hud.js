// HUD: one write per element per frame at most, cached values so the DOM is
// only touched when something actually changed. The compass strip shows the
// player's heading and the bearing of both sites.
import { ARSENAL, FRAG, SHOP } from './state.js';
import { ZONES } from './world.js';

const $ = (id) => document.getElementById(id);
const ui = {};
let seen = {};

function putText(el, v) { if (seen[el.id] !== v) { seen[el.id] = v; el.textContent = v; } }
function clockText(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function mountHud() {
  for (const id of ['crosshair', 'hitmarker', 'ammo-mag', 'ammo-reserve', 'weapon-name', 'health-num', 'health-fill',
    'money-val', 'money-kills', 'timer-time', 'timer-label', 'timer-score', 'round-label', 'alive-w', 'alive-r',
    'objective', 'bombstat', 'bomb-time', 'killfeed', 'reload', 'defuse', 'defuse-fill', 'banner', 'banner-title',
    'banner-sub', 'hint', 'vignette', 'flash', 'buy-rows', 'buy-money', 'menu', 'buy-overlay', 'end-overlay',
    'end-title', 'end-copy', 'end-tag', 'compass', 'menu-title', 'menu-copy']) ui[id] = $(id);
  // Buy menu rows, built once.
  ui['buy-rows'].innerHTML = SHOP.map((w) =>
    `<div class="buy-row" data-id="${w.id}"><span class="key">${w.key}</span><span>${w.name}<div class="desc">${w.desc}</div></span><span class="price">$${w.price}</span><span class="desc">${w.mag} rnd mag</span></div>` +
    '').join('') +
    `<div class="buy-row" data-id="grenade"><span class="key">6</span><span>${FRAG.name}<div class="desc">${FRAG.desc}</div></span><span class="price">$${FRAG.price}</span><span class="desc">max ${FRAG.max}</span></div>`;
  // Compass ticks, built once: cardinal marks + site markers, repositioned per frame.
  const ticks = [];
  for (const [deg, label, bold] of [[0, 'N', true], [45, 'NE', false], [90, 'E', true], [135, 'SE', false], [180, 'S', true], [225, 'SW', false], [270, 'W', true], [315, 'NW', false]]) {
    ticks.push({ deg, el: null, label, bold });
  }
  ui.compass.innerHTML = ticks.map((t, i) => `<span class="tick" data-i="${i}">${t.bold ? `<b>${t.label}</b>` : t.label}</span>`).join('') +
    `<span class="tick site" data-site="A">A</span><span class="tick site" data-site="B">B</span><span class="needle">▼</span>`;
  ui._ticks = [...ui.compass.querySelectorAll('.tick[data-i]')];
  ui._siteA = ui.compass.querySelector('.tick[data-site="A"]');
  ui._siteB = ui.compass.querySelector('.tick[data-site="B"]');
  ui._tickDefs = ticks;
  return ui;
}

// Heading in degrees: yaw=0 faces -Z, which the compass calls north.
function bearingDeg(yaw) {
  let d = ((-yaw) * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function drawHud(G, spreadPx, markT) {
  const p = G.player, w = ARSENAL[p.cur];
  // Crosshair gap follows spread.
  const ch = ui.crosshair.children;
  const g = 5 + spreadPx;
  ch[0].style.top = `${-g - 2}px`; ch[1].style.bottom = `${-g - 2}px`;
  ch[2].style.left = `${-g - 2}px`; ch[3].style.right = `${-g - 2}px`;
  ui.hitmarker.classList.toggle('on', G.time - markT < 0.14);

  // Compass: ticks slide past the needle as the player turns; site letters
  // sit at the bearing of each site from the player.
  const hd = bearingDeg(p.yaw);
  const W2 = 340, PX_PER_DEG = 2.2;
  for (let i = 0; i < ui._tickDefs.length; i++) {
    const def = ui._tickDefs[i];
    const off = angleDiff(def.deg, hd) * PX_PER_DEG;
    ui._ticks[i].style.left = `${W2 / 2 + off}px`;
    ui._ticks[i].style.display = Math.abs(off) > W2 / 2 ? 'none' : 'block';
  }
  for (const [siteEl, key] of [[ui._siteA, 'A'], [ui._siteB, 'B']]) {
    const s = ZONES[key];
    const bearing = bearingDeg(Math.atan2(-(s.x - p.pos.x), -(s.z - p.pos.z)));
    const off = angleDiff(bearing, hd) * PX_PER_DEG;
    siteEl.style.left = `${W2 / 2 + off}px`;
    siteEl.style.display = Math.abs(off) > W2 / 2 ? 'none' : 'block';
  }

  putText(ui['ammo-mag'], String(p.mag[p.cur]));
  ui['ammo-mag'].classList.toggle('empty', p.mag[p.cur] === 0);
  putText(ui['ammo-reserve'], p.reserve[p.cur] === Infinity ? '/ ∞' : `/ ${p.reserve[p.cur]}`);
  putText(ui['weapon-name'], w.name + (p.grenades ? ` · ${p.grenades} grenade${p.grenades > 1 ? 's' : ''}` : ''));
  putText(ui['health-num'], String(Math.max(0, Math.ceil(p.hp))));
  ui['health-num'].classList.toggle('low', p.hp <= 30);
  ui['health-fill'].style.width = `${Math.max(0, p.hp)}%`;
  putText(ui['money-val'], String(G.money));
  putText(ui['money-kills'], `Kills ${G.kills}`);
  putText(ui['timer-time'], clockText(G.phaseT));
  ui['timer-time'].classList.toggle('low', G.phaseT <= 10 && G.phase === 'live');
  putText(ui['timer-label'], G.phase === 'buy' ? 'Buy phase' : G.phase === 'live' ? 'Round' : G.phase === 'roundEnd' ? 'Next round' : 'Match over');
  const scoreHtml = `<span class="w">WARDENS ${G.score.w}</span> — <span class="r">${G.score.r} EMBERS</span>`;
  if (seen.scoreHtml !== scoreHtml) { seen.scoreHtml = scoreHtml; ui['timer-score'].innerHTML = scoreHtml; }
  putText(ui['round-label'], `ROUND ${G.round} / 9`);
  const atkAlive = G.fighters.filter((f) => f.team === 'r' && f.alive).length;
  const defAlive = (p.alive ? 1 : 0) + G.fighters.filter((f) => f.team === 'w' && f.alive).length;
  putText(ui['alive-w'], String(defAlive));
  putText(ui['alive-r'], String(atkAlive));
  putText(ui.objective, G.bomb.state === 'planted' ? `Charge live at site ${G.bomb.site} — defuse it` : 'Defend sites A and B');
  ui.bombstat.style.display = G.bomb.state === 'planted' ? 'block' : 'none';
  if (G.bomb.state === 'planted') putText(ui['bomb-time'], clockText(G.bomb.fuse));
  ui.reload.style.display = p.reloading > 0 ? 'block' : 'none';
  const defusing = G.bomb.state === 'planted' && G.bomb.defuseT > 0;
  ui.defuse.style.display = defusing ? 'block' : 'none';
  if (defusing) ui['defuse-fill'].style.width = `${(G.bomb.defuseT / 5) * 100}%`;
  const showBanner = G.time < G.banner.until && G.banner.title;
  ui.banner.style.display = showBanner ? 'block' : 'none';
  if (showBanner) {
    putText(ui['banner-title'], G.banner.title);
    putText(ui['banner-sub'], G.banner.sub);
  }
  // Killfeed.
  const feedHtml = G.feed.map((f) =>
    `<div><span class="${f.aTeam === 'w' ? 'w' : 'r'}">${f.a}</span> <span class="wp">[${f.wp}]</span> <span class="${f.bTeam === 'w' ? 'w' : 'r'}">${f.b}</span></div>`).join('');
  if (seen.feed !== feedHtml) { seen.feed = feedHtml; ui.killfeed.innerHTML = feedHtml; }
  // Damage vignette + hurt flash decay handled by main via style writes.
  putText(ui.hint, !p.alive ? 'You are down — your squad fights on' : G.phase === 'buy' ? 'Press B for the buy menu' : '');
  // Buy menu affordability + owned marks.
  if (G.phase === 'buy') {
    for (const row of ui['buy-rows'].children) {
      const id = row.dataset.id;
      const owned = id === 'grenade' ? p.grenades >= FRAG.max : !!p.weapons[id];
      row.classList.toggle('owned', owned);
      const priceEl = row.querySelector('.price');
      const cost = id === 'grenade' ? FRAG.price : ARSENAL[id].price;
      priceEl.classList.toggle('poor', G.money < cost && !owned);
    }
    putText(ui['buy-money'], `$${G.money}`);
  }
}

export function showPanel(name) {
  ui.menu.hidden = name !== 'menu';
  ui['buy-overlay'].hidden = name !== 'buy';
  ui['end-overlay'].hidden = name !== 'end';
  if (name === 'end') {
    const won = window.__emberlineState.score.w >= 5;
    ui['end-tag'].textContent = won ? 'Match over — works held' : 'Match over — works lost';
    ui['end-title'].textContent = won ? 'Works held.' : 'Works lost.';
    ui['end-copy'].textContent = `Final score Wardens ${window.__emberlineState.score.w} — ${window.__emberlineState.score.r} Embers. ` +
      `You scored ${window.__emberlineState.kills} eliminations. The works remember who held them.`;
  }
}
