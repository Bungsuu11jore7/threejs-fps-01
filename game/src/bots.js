// Bot brains: attackers run waypoint routes to a site and plant; defenders hold
// angles and rotate on sound. Perception is throttled and staggered so a dozen
// line-of-sight checks never land in one step. Shots are real raycasts with
// aim error that grows with distance and target speed — never dice rolls.
import * as THREE from 'three';
import { grantWeapon, clampN, wobble, ARSENAL } from './state.js';
import { slideBody, hasSight, routePath, closestNode, POINTS, ZONE_NODE, ZONES } from './world.js';
import { shoot, eyeY } from './weapons.js';

const EMBER_NAMES = ['R. Kade', 'M. Voss', 'T. Ilya', 'S. Marek'];
const WARDEN_NAMES = ['J. Rook', 'A. Sable'];
const MARCH_V = 3.4, DUEL_V = 1.7;
const _v = { x: 0, y: 0, z: 0 };

export function deployBots(G) {
  G.fighters = [];
  const r = G._rng;
  // Attackers: split across the two sites, carrier is the first.
  const sites = ['A', 'B', 'A', 'B'];
  for (let i = 0; i < 4; i++) {
    const f = newBot(G, 'r', EMBER_NAMES[i], 'atk', sites[i]);
    const [x, z] = [[-21, -2], [-21, 0], [-21, 2], [-20, -4]][i];
    f.pos.x = x; f.pos.z = z;
    f.yaw = -Math.PI / 2; // face east
    grantWeapon(f, i % 2 ? 'vk9' : 'ar77');
    f.cur = i % 2 ? 'vk9' : 'ar77';
    f.mag[f.cur] = ARSENAL[f.cur].mag; f.reserve[f.cur] = Infinity;
    f.brain.carrier = i === 0;
    G.fighters.push(f);
  }
  // Defenders: one holds A, one holds B; the player covers mid.
  const holds = [[-13, -10, 3], [14, 10, 6]];
  for (let i = 0; i < 2; i++) {
    const f = newBot(G, 'w', WARDEN_NAMES[i], 'def', i === 0 ? 'A' : 'B');
    f.pos.x = holds[i][0]; f.pos.z = holds[i][1];
    f.brain.holdNode = holds[i][2];
    f.yaw = i === 0 ? Math.PI * 0.75 : -Math.PI * 0.25;
    grantWeapon(f, 'ar77'); f.cur = 'ar77';
    f.mag.ar77 = ARSENAL.ar77.mag; f.reserve.ar77 = Infinity;
    G.fighters.push(f);
  }
  G.bomb.carrier = G.fighters[0];
}

function newBot(G, team, name, role, site) {
  const f = {
    team, name, isPlayer: false,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, hp: 100, alive: true,
    crouch: false, onGround: true,
    weapons: {}, order: [], cur: 'p9', mag: {}, reserve: {},
    grenades: 0, reloading: 0, reloadWeapon: '', fireCd: 0, bloom: 0,
    recoilP: 0, recoilY: 0, lastShotAt: -99, scoped: false,
    brain: {
      role, site, state: role === 'atk' ? 'route' : 'hold',
      route: [], routeI: 0, target: null, reactT: 0,
      burstLeft: 0, burstCd: 0, pauseT: 0, scanT: 0, loseT: 0,
      plantT: 0, holdNode: 0, holdT: 0, scanDir: 1, stuckT: 0,
      lx: 0, lz: 0, thinkT: G._rng() * 0.12,
    },
  };
  grantWeapon(f, 'p9');
  f.mag.p9 = 12; f.reserve.p9 = Infinity;
  return f;
}

function foesOf(G, f) {
  return f.team === 'w' ? G.fighters.filter((b) => b.team === 'r') : [G.player, ...G.fighters.filter((b) => b.team === 'w')];
}

function lookAround(G, f, dt) {
  const b = f.brain;
  b.thinkT -= dt;
  if (b.thinkT > 0) return;
  b.thinkT = 0.12;
  const eye = f.pos.y + eyeY(f);
  let best = null, bd = 46;
  for (const e of foesOf(G, f)) {
    if (!e.alive) continue;
    const dx = e.pos.x - f.pos.x, dz = e.pos.z - f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bd) continue;
    const ey = e.pos.y + eyeY(e) - 0.35;
    if (!hasSight(f.pos.x, eye, f.pos.z, e.pos.x, ey, e.pos.z, G.world.colliders)) continue;
    best = e; bd = d;
  }
  if (best) {
    if (b.target !== best) { b.target = best; b.reactT = 0.35 + G._rng() * 0.3; b.loseT = 0; }
  } else if (b.target) {
    b.loseT += 0.12;
    if (b.loseT > 1.6) { b.target = null; b.loseT = 0; }
  }
}

function turnTo(f, tx, tz, dt, rate) {
  const want = Math.atan2(-(tx - f.pos.x), -(tz - f.pos.z));
  let d = want - f.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  f.yaw += clampN(d, -rate * dt, rate * dt);
}

function walkTo(G, f, tx, tz, speed, dt) {
  const dx = tx - f.pos.x, dz = tz - f.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  f.vel.x = vx; f.vel.z = vz;
  f.onGround = slideBody(f.pos, 0.35, 1.7, vx * dt, -0.01, vz * dt, G.world.colliders);
  turnTo(f, tx, tz, dt, 6);
  return d < 0.9;
}

function chartRoute(G, f, toNode) {
  const from = closestNode(f.pos.x, f.pos.z);
  f.brain.route = routePath(from, toNode);
  f.brain.routeI = 0;
}

export function stepBot(G, f, dt, vfx, index) {
  if (!f.alive) { f.vel.x = f.vel.z = 0; return; }
  // Demo/screenshot mode: hold the placed pose exactly, no routes, no fire.
  if (G.demo) { f.vel.x = 0; f.vel.z = 0; return; }
  const b = f.brain, r = G._rng;
  if (f.fireCd > 0) f.fireCd -= dt;
  if (f.reloading > 0) {
    f.reloading -= dt;
    if (f.reloading <= 0) {
      const w = ARSENAL[f.reloadWeapon];
      f.mag[f.reloadWeapon] = w.mag; f.reloading = 0; f.reloadWeapon = '';
    }
  }
  f.bloom = Math.max(0, f.bloom - dt * 0.05);
  lookAround(G, f, dt);

  const bombPlanted = G.bomb.state === 'planted' || G.bomb.state === 'planting';
  // --- combat: face the target and fire in bursts -------------------------
  if (b.target && b.target.alive) {
    const t = b.target;
    const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z;
    const dist = Math.hypot(dx, dz);
    turnTo(f, t.pos.x, t.pos.z, dt, 7);
    // Aim at the chest, sometimes the head, with distance-scaled error.
    const aimY = t.pos.y + eyeY(t) - (r() < 0.16 ? -0.1 : 0.35);
    const wantPitch = Math.atan2(aimY - (f.pos.y + eyeY(f)), dist);
    const err = 0.02 + dist * 0.0011 + Math.hypot(t.vel.x, t.vel.z) * 0.004;
    f.pitch = clampN(wantPitch + wobble(r) * err * 0.4, -1.2, 1.2);
    if (b.reactT > 0) b.reactT -= dt;
    else if (b.pauseT > 0) b.pauseT -= dt;
    else {
      if (b.burstLeft <= 0) { b.burstLeft = 3 + ((r() * 3) | 0); b.burstCd = 0; }
      b.burstCd -= dt;
      if (b.burstCd <= 0) {
        if (f.mag[f.cur] <= 0) { if (f.reloading <= 0) { f.reloading = ARSENAL[f.cur].reload; f.reloadWeapon = f.cur; } }
        else {
          // Re-aim with fresh error for each shot.
          f.yaw += wobble(r) * err;
          shoot(G, f, vfx);
          b.burstLeft--;
          b.burstCd = 0.11 + r() * 0.03;
          if (b.burstLeft <= 0) b.pauseT = 0.5 + r() * 0.5;
        }
      }
    }
    // Strafe while fighting, keep some distance.
    if (dist < 6) {
      const s = (index % 2 ? 1 : -1) * DUEL_V * 0.5;
      const px = -dz / dist, pz = dx / dist;
      f.vel.x = px * s; f.vel.z = pz * s;
      slideBody(f.pos, 0.35, 1.7, f.vel.x * dt, -0.01, f.vel.z * dt, G.world.colliders);
    }
    return;
  }

  // --- no target: follow the role -----------------------------------------
  if (b.role === 'atk') {
    if (bombPlanted) {
      // Fall back and guard the planted charge.
      const s = ZONES[G.bomb.site];
      if (Math.hypot(f.pos.x - s.x, f.pos.z - s.z) > 6) {
        if (b.state !== 'defendBomb' || b.route.length === 0) { b.state = 'defendBomb'; chartRoute(G, f, ZONE_NODE[G.bomb.site]); }
        followRoute(G, f, dt, MARCH_V);
      } else { b.state = 'hold'; f.vel.x = f.vel.z = 0; sweep(G, f, dt); }
      return;
    }
    if (b.state === 'plant') {
      const s = ZONES[b.site];
      const d = Math.hypot(f.pos.x - s.x, f.pos.z - s.z);
      if (d > s.r) { b.state = 'route'; chartRoute(G, f, ZONE_NODE[b.site]); return; }
      b.plantT += dt;
      G.bomb.state = 'planting'; G.bomb.site = b.site; G.bomb.x = s.x; G.bomb.z = s.z; G.bomb.plantT = b.plantT;
      if (b.plantT >= 4) { b.state = 'hold'; }
      return;
    }
    if (b.route.length === 0) chartRoute(G, f, ZONE_NODE[b.site]);
    if (followRoute(G, f, dt, MARCH_V)) {
      // Arrived at the site: carrier plants, others hold the site.
      if (b.carrier) { b.state = 'plant'; b.plantT = 0; }
      else { b.state = 'hold'; b.holdNode = ZONE_NODE[b.site]; }
    }
    return;
  }

  // Defender: hold, or rotate to the planted site, or investigate noise.
  if (bombPlanted) {
    if (b.state !== 'pushSite') { b.state = 'pushSite'; chartRoute(G, f, ZONE_NODE[G.bomb.site]); }
    if (followRoute(G, f, dt, MARCH_V)) { b.state = 'hold'; sweep(G, f, dt); }
    return;
  }
  if (b.state === 'investigate') {
    if (followRoute(G, f, dt, MARCH_V)) {
      b.holdT += dt; sweep(G, f, dt);
      if (b.holdT > 4) { b.state = 'hold'; b.holdT = 0; chartRoute(G, f, b.holdNode); }
    }
    return;
  }
  // Listen: a recent loud noise nearby pulls the defender off its angle.
  for (let i = G.noise.length - 1; i >= 0; i--) {
    const n = G.noise[i];
    if (G.time - n.t > 3) { G.noise.splice(i, 1); continue; }
    const d = Math.hypot(n.x - f.pos.x, n.z - f.pos.z);
    if (d < 18 && d > 4) {
      b.state = 'investigate'; chartRoute(G, f, closestNode(n.x, n.z)); b.holdT = 0;
      break;
    }
  }
  if (b.state === 'hold') {
    const [hx, hz] = POINTS[b.holdNode];
    if (Math.hypot(f.pos.x - hx, f.pos.z - hz) > 1.2) walkTo(G, f, hx, hz, MARCH_V, dt);
    else { f.vel.x = f.vel.z = 0; sweep(G, f, dt); }
  }
}

function followRoute(G, f, dt, speed) {
  const b = f.brain;
  if (b.routeI >= b.route.length) return true;
  const [tx, tz] = POINTS[b.route[b.routeI]];
  const arrived = walkTo(G, f, tx, tz, speed, dt);
  if (arrived) b.routeI++;
  // Stuck detection: barely moved for a while — skip to the next waypoint.
  const moved = Math.hypot(f.pos.x - b.lx, f.pos.z - b.lz);
  if (moved < 0.05) { b.stuckT += dt; if (b.stuckT > 1.2) { b.routeI++; b.stuckT = 0; } }
  else b.stuckT = 0;
  b.lx = f.pos.x; b.lz = f.pos.z;
  return b.routeI >= b.route.length;
}

function sweep(G, f, dt) {
  const b = f.brain;
  b.scanT += dt;
  f.yaw += Math.sin(b.scanT * 0.5) * 0.35 * dt * b.scanDir;
  if (b.scanT > 6) { b.scanT = 0; b.scanDir *= -1; }
}

// --- rigs (three.js bodies for bots) ---------------------------------------
// A readable humanoid at a glance: helmet, vest torso, shoulder plates, arms
// holding the rifle forward, backpack, two legs that swing while walking.
export function makeRig(team, mats) {
  const g = new THREE.Group();
  const bodyMat = team === 'w' ? mats.warden : mats.ember;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.85, 10), bodyMat);
  body.position.y = 0.95; body.castShadow = true; g.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.36), mats.dark);
  vest.position.y = 1.0; vest.castShadow = true; g.add(vest);
  const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), bodyMat);
  shoulderL.position.set(-0.38, 1.32, 0); g.add(shoulderL);
  const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), bodyMat);
  shoulderR.position.set(0.38, 1.32, 0); g.add(shoulderR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bodyMat);
  head.position.y = 1.56; head.castShadow = true; g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.dark);
  helmet.position.y = 1.6; g.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.1), mats.visor);
  visor.position.set(0, 1.57, -0.17); g.add(visor);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.16), mats.dark);
  pack.position.set(0, 1.0, 0.28); g.add(pack);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.11), bodyMat);
  armL.position.set(-0.42, 1.05, -0.18); armL.rotation.x = -0.9; g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.11), bodyMat);
  armR.position.set(0.42, 1.05, -0.18); armR.rotation.x = -0.9; g.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.75), mats.gun);
  gun.position.set(0.18, 1.15, -0.35); g.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), mats.dark);
  legL.position.set(-0.16, 0.25, 0); g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), mats.dark);
  legR.position.set(0.16, 0.25, 0); g.add(legR);
  // Health bar: dark backing + green/red fill, billboarded by the renderer.
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, depthTest: false }));
  barBg.scale.set(0.9, 0.09, 1); barBg.position.y = 1.95; g.add(barBg);
  const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: team === 'w' ? 0x39c2b8 : 0xff6a4d, depthTest: false }));
  barFg.scale.set(0.86, 0.06, 1); barFg.position.y = 1.95; g.add(barFg);
  return { group: g, body, head, gun, legL, legR, armL, armR, barBg, barFg, walkT: 0 };
}

export function poseRig(rig, f) {
  rig.group.position.set(f.pos.x, f.pos.y, f.pos.z);
  rig.group.rotation.y = f.yaw + Math.PI;
  rig.group.visible = f.alive;
  const frac = Math.max(0, f.hp / 100);
  rig.barFg.scale.x = 0.86 * frac;
  rig.barFg.material.opacity = f.alive ? 1 : 0;
  rig.barBg.material.opacity = f.alive ? 0.85 : 0;
  // Aim the gun with the body: pitch the whole rig slightly.
  rig.gun.rotation.x = f.pitch * 0.5;
  // Walk cycle: swing the legs and arms with the body's speed.
  const speed = Math.hypot(f.vel.x, f.vel.z);
  if (speed > 0.4 && f.alive) rig.walkT += 0.12 * speed;
  else rig.walkT *= 0.9;
  const sw = Math.sin(rig.walkT) * 0.45 * Math.min(1, speed / 3);
  rig.legL.rotation.x = sw;
  rig.legR.rotation.x = -sw;
  rig.armL.rotation.x = -0.9 - sw * 0.4;
  rig.armR.rotation.x = -0.9 + sw * 0.4;
}
