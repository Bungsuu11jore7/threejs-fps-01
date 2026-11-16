// Round lifecycle: buy phase, live round, plant/defuse, win checks, economy,
// match end. One function per transition; the sim calls advanceRound every step.
import { SHOP_TIME, ROUND_LEN, PLANT_LEN, FUSE_LEN, ROUNDS_TO_WIN, ARSENAL, FRAG, grantWeapon } from './state.js';
import { deployBots } from './bots.js';
import { placePlayer } from './player.js';
import { sound } from './audio.js';
import { ZONES } from './world.js';

export function openMatch(G) {
  G.score = { w: 0, r: 0 };
  G.round = 1; G.money = 800; G.kills = 0;
  G.player.grenades = 0;
  G.player.weapons = {}; G.player.order = []; G.player.mag = {}; G.player.reserve = {};
  grantWeapon(G.player, 'p9');
  openRound(G);
}

export function openRound(G) {
  G.phase = 'buy';
  G.phaseT = SHOP_TIME;
  G.bomb = { state: 'idle', site: '', x: 0, z: 0, plantT: 0, fuse: 0, carrier: null, defuseT: 0, defuser: null };
  G.grenades.length = 0;
  G.noise.length = 0;
  placePlayer(G);
  deployBots(G);
  G.bomb.carrier = G.fighters[0];
  flashBanner(G, `ROUND ${G.round}`, G.round === 1 ? 'Buy your loadout — B opens the shop' : 'Buy phase — B opens the shop');
}

export function flashBanner(G, title, sub) {
  G.banner = { title, sub, until: G.time + 3.2 };
}

function closeRound(G, winner, reason) {
  G.phase = 'roundEnd';
  G.phaseT = 5;
  G.endReason = reason;
  if (winner === 'w') {
    G.score.w++;
    G.money += 325;
    flashBanner(G, 'ROUND WON', reason);
    sound.win();
  } else {
    G.score.r++;
    G.money += 150;
    flashBanner(G, 'ROUND LOST', reason);
    sound.lose();
  }
  if (G.score.w >= ROUNDS_TO_WIN || G.score.r >= ROUNDS_TO_WIN) {
    G.phase = 'matchEnd';
    G.phaseT = 0;
  }
}

export function advanceRound(G, dt) {
  const b = G.bomb;
  if (G.phase === 'buy') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) { G.phase = 'live'; G.phaseT = ROUND_LEN; flashBanner(G, 'DEFEND THE SITES', 'Embers are coming — hold A and B'); }
    return;
  }
  if (G.phase === 'roundEnd') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      if (G.score.w >= ROUNDS_TO_WIN || G.score.r >= ROUNDS_TO_WIN) { G.phase = 'matchEnd'; return; }
      G.round++;
      openRound(G);
    }
    return;
  }
  if (G.phase !== 'live') return;
  G.phaseT -= dt;

  // Bomb state machine.
  if (b.state === 'planting' && b.plantT >= PLANT_LEN) {
    b.state = 'planted'; b.fuse = FUSE_LEN; b.plantT = 0;
    flashBanner(G, 'CHARGE PLANTED', `Site ${b.site} — defuse it before it blows`);
    sound.plantStart();
  }
  if (b.state === 'planted') {
    b.fuse -= dt;
    if (Math.ceil(b.fuse) !== Math.ceil(b.fuse + dt)) sound.plantBeep();
    if (b.fuse <= 0) { closeRound(G, 'r', 'The charge detonated at site ' + b.site); return; }
  }
  if (b.state === 'defused') { closeRound(G, 'w', 'Charge defused — site held'); return; }

  // Carrier handover: if the carrier dies, the nearest living attacker carries.
  if (b.carrier && !b.carrier.alive && b.state !== 'planted') {
    let best = null, bd = Infinity;
    for (const f of G.fighters) {
      if (f.team !== 'r' || !f.alive) continue;
      const s = ZONES[f.brain.site];
      const d = Math.hypot(f.pos.x - s.x, f.pos.z - s.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) {
      for (const f of G.fighters) f.brain.carrier = false;
      best.brain.carrier = true; b.carrier = best;
      best.brain.state = 'route'; best.brain.route = [];
    }
  }

  // Win checks.
  const atkAlive = G.fighters.some((f) => f.team === 'r' && f.alive);
  const defAlive = G.player.alive || G.fighters.some((f) => f.team === 'w' && f.alive);
  if (!atkAlive) { closeRound(G, 'w', b.state === 'planted' ? 'Embers eliminated — but the charge is still live' : 'Ember squad eliminated'); return; }
  if (!defAlive) { closeRound(G, 'r', 'Wardens eliminated'); return; }
  if (G.phaseT <= 0) {
    if (b.state === 'planted') { closeRound(G, 'r', 'Time ran out with the charge live'); }
    else closeRound(G, 'w', 'Embers ran out of time');
  }
}

export function purchase(G, id) {
  if (G.phase !== 'buy') return false;
  const p = G.player;
  if (id === 'grenade') {
    if (p.grenades >= FRAG.max || G.money < FRAG.price) { sound.deny(); return false; }
    G.money -= FRAG.price; p.grenades++;
    sound.buy(); return true;
  }
  const w = ARSENAL[id];
  if (!w) return false;
  if (p.weapons[id]) {
    // Re-buy tops the reserve up.
    if (w.reserve === Infinity) { sound.deny(); return false; }
    const cost = 150;
    if (G.money < cost || p.reserve[id] >= w.reserve) { sound.deny(); return false; }
    G.money -= cost; p.reserve[id] = w.reserve; sound.buy(); return true;
  }
  if (G.money < w.price) { sound.deny(); return false; }
  G.money -= w.price;
  grantWeapon(p, id);
  p.cur = id;
  sound.buy(); return true;
}
