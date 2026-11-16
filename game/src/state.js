// Heart of EMBERLINE: a single object holds every mutable fact of a match.
// The fixed-step sim (main.js) mutates it; rendering only ever reads it.
export const STEP = 1 / 60;
export const ROUNDS_TO_WIN = 5;
export const SHOP_TIME = 15;
export const ROUND_LEN = 100;
export const PLANT_LEN = 4;
export const DEFUSE_LEN = 5;
export const FUSE_LEN = 35;

// Deterministic PRNG (mulberry32) so demo and screenshot setups replay exactly.
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clampN = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const mix = (a, b, t) => a + (b - a) * t;
// Cheap bell-shaped jitter from three uniform draws, zero allocation.
export function wobble(r) { return (r() + r() + r()) - 1.5; }

export const ARSENAL = {
  p9:   { id: 'p9',   name: 'P9 Sparrow',       key: '1', price: 0,    auto: false, dmg: 26, headMul: 2.0, rate: 0.16, mag: 12, reserve: Infinity, reload: 1.4, spread: 0.011, moveSpread: 0.020, recoil: 0.011, range: 42,  zoom: 1,   pellets: 1, desc: 'Sidearm · steady, endless reserve' },
  ar77: { id: 'ar77', name: 'AR-77 Longspur',   key: '2', price: 2700, auto: true,  dmg: 33, headMul: 2.0, rate: 0.105, mag: 25, reserve: 75, reload: 2.3, spread: 0.009, moveSpread: 0.026, recoil: 0.014, range: 60,  zoom: 1,   pellets: 1, desc: 'Rifle · true, the daily driver' },
  vk9:  { id: 'vk9',  name: 'VK-9 Hornet',      key: '3', price: 1500, auto: true,  dmg: 21, headMul: 2.0, rate: 0.07,  mag: 30, reserve: 90, reload: 2.0, spread: 0.013, moveSpread: 0.022, recoil: 0.009, range: 30,  zoom: 1,   pellets: 1, desc: 'SMG · rapid, built for close rooms' },
  sg12: { id: 'sg12', name: 'SG-12 Bramble',    key: '4', price: 1700, auto: false, dmg: 9,  headMul: 1.6, rate: 0.85,  mag: 6,  reserve: 24, reload: 2.6, spread: 0.05,  moveSpread: 0.03,  recoil: 0.05,  range: 18,  zoom: 1,   pellets: 8, desc: 'Shotgun · eight pellets, ruinous near' },
  lw50: { id: 'lw50', name: 'LW-50 Falcon',     key: '5', price: 4500, auto: false, dmg: 95, headMul: 2.0, rate: 1.4,  mag: 5,  reserve: 15, reload: 3.2, spread: 0.002, moveSpread: 0.05,  recoil: 0.06,  range: 120, zoom: 2.2, pellets: 1, desc: 'Marksman rifle · right-click to scope in' },
};
export const FRAG = { id: 'grenade', name: 'Spark Grenade', price: 300, max: 2, desc: 'Frag · hold G to lob it' };
export const SHOP = [ARSENAL.ar77, ARSENAL.vk9, ARSENAL.sg12, ARSENAL.lw50, ARSENAL.p9];

export function newFighter(team, name, isPlayer) {
  return {
    team, name, isPlayer: !!isPlayer,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, hp: 100, alive: true,
    crouch: false, onGround: true,
    // fighting state
    weapons: {}, order: ['p9'], cur: 'p9', mag: {}, reserve: {},
    grenades: 0, reloading: 0, reloadWeapon: '', fireCd: 0, bloom: 0,
    recoilP: 0, recoilY: 0, lastShotAt: -99, scoped: false,
    // bot brain (the player never uses it)
    brain: null, speedMul: 1,
  };
}

export function grantWeapon(f, id) {
  const w = ARSENAL[id];
  f.weapons[id] = w;
  f.mag[id] = w.mag;
  f.reserve[id] = w.reserve;
  if (!f.order.includes(id)) f.order.push(id);
}

export function freshState() {
  const g = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    paused: false,
    time: 0, round: 1,
    score: { w: 0, r: 0 },
    phaseT: 0,           // seconds left in the current phase
    roundWins: 0,
    money: 800, kills: 0,
    player: newFighter('w', 'D. Marsh', true),
    fighters: [],        // bots only; the player lives apart
    bomb: { state: 'idle', site: '', x: 0, z: 0, plantT: 0, fuse: 0, carrier: null, defuseT: 0, defuser: null },
    grenades: [],        // live grenades: {x,y,z,vx,vy,vz,fuse,bounces}
    feed: [],            // killfeed lines {a, b, wp, aTeam, bTeam, t}
    banner: { title: '', sub: '', until: 0 },
    noise: [],           // {x, z, t, loud} heard shots
    endReason: '',
    demo: null,          // shot mode: {name, steps, frozen}
    seed: 20261118,
  };
  grantWeapon(g.player, 'p9');
  g.player.mag.p9 = 12;
  return g;
}
