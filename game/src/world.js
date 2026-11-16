// Halcyon Works: a derelict solar refinery, 48 x 40 m. Two lanes (A-long north,
// B-long south) and a mid crossing through the double doors. Sites: A "Array" (NW),
// B "Pump House" (SE). All collision is axis-aligned boxes; all sight checks are
// rays against those boxes, so what the eye sees is what the bullets meet.
// Visual-only props sit outside the yard or above every sightline, so they can
// never be false cover: solar rows beyond the walls, dunes on the horizon,
// vents on the pump-house roof, pipes flat against the walls.
import * as THREE from 'three';
import { TINT } from './palette.js';

// [x0, z0, x1, z1, height, material] — every solid in the yard.
const SOLIDS = [
  // outer shell
  [-24, -20, 24, -19, 4.5, 'wall'], // north wall
  [-24, 19, 24, 20, 4.5, 'wall'], // south wall
  [-24, -20, -23, 20, 4.5, 'wall'], // west wall
  [23, -20, 24, 20, 4.5, 'wall'], // east wall
  // mid divider, gap = the double doors at x -4.5..4.5
  [-9, -1.2, -4.5, 0, 3.4, 'wall'], // mid west
  [4.5, -1.2, 9, 0, 3.4, 'wall'], // mid east
  // north hall wall with A-long gap
  [-14, -8, -6, -7, 3.4, 'wall'], // hall north west
  [2, -8, 12, -7, 3.4, 'wall'], // hall north east
  // south hall wall with B-long gap
  [-12, 7, -2, 8, 3.4, 'wall'], // hall south west
  [6, 7, 14, 8, 3.4, 'wall'], // hall south east
  // silo base + pump house
  [-19.5, -15.5, -12.5, -8.5, 1.8, 'wall'], // silo plinth
  [13, 9, 19, 15, 3.6, 'teal'], // pump house
  // crates and blocks
  [-11, -15.5, -9, -13.5, 1.6, 'crate'],
  [-6.5, -17, -4.5, -15, 1.2, 'crate'],
  [1, -15, 3, -13, 1.6, 'crate'],
  [9, -12, 11, -10, 1.2, 'crate'],
  [-15, 2, -13, 4, 1.6, 'crate'],
  [-5, 6.5, -3, 8.5, 1.2, 'crate'],
  [5, 13, 7, 15, 1.6, 'crate'],
  [11, 4.5, 13, 6.5, 1.2, 'crate'],
  [17, -8, 19, -6, 1.6, 'crate'],
  [-19, 12, -17, 14, 1.2, 'crate'],
  [-1.5, -5.5, 0.5, -3.5, 1.6, 'crate'], // mid crate
  [14, -15, 16, -13, 2.2, 'rust'],
  [-17, -2, -15, 0, 2.4, 'teal'],
  [8, 10, 10, 12, 2.0, 'crate'],
];
const DRUMS = [ // [x, z, r, h] — cylinders, collided as small square boxes
  [-13, -9.5, 0.7, 1.1], [13.5, 9.5, 0.7, 1.1], [15.5, 9.5, 0.7, 1.1],
  [-8, -12.5, 0.7, 1.1], [18, 13, 0.7, 1.1], [3, -6, 0.7, 1.1],
];

export const ZONES = {
  A: { x: -16, z: -12, r: 4.2, label: 'A', name: 'Array' },
  B: { x: 16, z: 12, r: 4.2, label: 'B', name: 'Pump House' },
};
export const STARTS = {
  atk: [[-21, -2], [-21, 0], [-21, 2], [-20, -4]],
  def: [[20, -2], [20, 0], [20, 2]],
};
// Waypoint graph for bot routes. Points: [x, z]; links: pairs.
export const POINTS = [
  [-21, 0], [-18, -8], [-10, -14], [-16, -12], [-18, 8], [-10, 14],
  [16, 12], [0, -6], [0, 6], [10, -8], [12, 8], [20, 0], [-2, 0],
  [-13, -10], [14, 10], [-16, 4], [16, -4], [4, -14], [-4, 14],
];
export const LINKS = [
  [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [1, 7], [7, 9],
  [9, 16], [7, 12], [12, 8], [8, 10], [10, 6], [8, 5], [9, 17], [17, 2],
  [12, 11], [11, 16], [11, 10], [8, 18], [18, 5], [1, 15], [15, 4],
  [2, 13], [13, 3], [6, 14], [14, 10], [16, 9], [3, 13], [5, 18],
];
export const ZONE_NODE = { A: 3, B: 6 };

function letterTexture(letter) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8b93a'; ctx.beginPath(); ctx.arc(64, 64, 58, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a1712'; ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeWorld(scene, mats) {
  const colliders = [];
  const group = new THREE.Group();
  for (const [x0, z0, x1, z1, h, mat] of SOLIDS) {
    const w = x1 - x0, d = z1 - z0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat] || mats.wall);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: h });
  }
  for (const [x, z, r, h] of DRUMS) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mats.rust);
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: h });
  }
  // Silo tank on its base, pump-house roof unit, lamp poles, pipes.
  // silo tank: painted steel with a hazard band, so the landmark reads in dusk
  const siloMat = new THREE.MeshStandardMaterial({ color: 0x93a9bd, roughness: 0.55, metalness: 0.15 });
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 4.4, 20), siloMat);
  silo.position.set(-16, 4.0, -12); silo.castShadow = true; group.add(silo);
  const siloBand = new THREE.Mesh(new THREE.CylinderGeometry(2.34, 2.34, 0.5, 20), mats.hazard);
  siloBand.position.set(-16, 3.1, -12); group.add(siloBand);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 4), mats.wallDark);
  roof.position.set(16, 4.2, 12); roof.castShadow = true; group.add(roof);
  // Roof vents on the pump house, above every sightline.
  for (const dx of [-1.6, 0, 1.6]) {
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 10), mats.rust);
    vent.position.set(16 + dx, 5.1, 12); vent.castShadow = true; group.add(vent);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 22, 10), mats.teal);
  pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 3.6, -19.2); group.add(pipe);
  const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 22, 10), mats.rust);
  pipe2.rotation.z = Math.PI / 2; pipe2.position.set(0, 3.1, 19.2); group.add(pipe2);
  for (const [x, z] of [[-22, -18], [22, -18], [-22, 18], [22, 18]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), mats.dark);
    pole.position.set(x, 2.7, z); group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mats.lamp);
    lamp.position.set(x, 5.5, z); group.add(lamp);
  }
  // Solar rows beyond the walls: tilted panel faces catching the low sun.
  // They stand outside the yard, visible over the walls, never in a sightline.
  const panelGeo = new THREE.BoxGeometry(3.4, 0.08, 2.2);
  const legGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12);
  for (const [px, pz] of [[-29, -12], [-29, -6], [-29, 0], [-29, 6], [29, -6], [29, 0], [29, 6], [29, 12]]) {
    const panel = new THREE.Mesh(panelGeo, mats.panel);
    panel.position.set(px, 1.5, pz);
    panel.rotation.z = px < 0 ? 0.5 : -0.5;
    panel.rotation.y = px < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(panel);
    for (const [lx, lz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) {
      const leg = new THREE.Mesh(legGeo, mats.dark);
      leg.position.set(px + lx * 0.4, 0.55, pz + lz);
      group.add(leg);
    }
  }
  // Dune mounds on the horizon, far outside the yard.
  const duneMat = new THREE.MeshStandardMaterial({ color: 0x8a6f47, roughness: 1, metalness: 0 });
  for (const [dx, dz, r, s] of [[-55, -30, 26, 0.16], [-20, -58, 30, 0.13], [30, -55, 24, 0.18], [58, -10, 28, 0.14], [55, 35, 26, 0.15], [10, 58, 30, 0.12], [-45, 45, 24, 0.17], [-58, 15, 22, 0.14]]) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), duneMat);
    dune.scale.y = s; dune.position.set(dx, 0, dz);
    group.add(dune);
  }
  // Site letters, floating above each site, plus a ground ring marking it.
  for (const key of ['A', 'B']) {
    const s = ZONES[key];
    const spr = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(key), transparent: true, side: THREE.DoubleSide, fog: false }),
    );
    spr.position.set(s.x, 5.6, s.z);
    group.add(spr);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 4.1, 40),
      new THREE.MeshBasicMaterial({ color: TINT.hazard, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.z);
    group.add(ring);
  }
  // Ground + sky dome.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mats.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 24, 16), mats.sky);
  scene.add(sky);
  scene.add(group);
  return { colliders, group };
}

// --- collision -------------------------------------------------------------
// Axis-separated AABB move. p = {x,y,z} feet position; half = horizontal half-size;
// height = body height. Returns true when standing on something (y clamped).
export function slideBody(p, half, height, dx, dy, dz, colliders) {
  let onGround = false;
  p.x += dx;
  for (const c of colliders) {
    if (c.top <= p.y + 0.05 || p.y + height <= 0.05) continue;
    if (p.x + half > c.minX && p.x - half < c.maxX && p.z + half > c.minZ && p.z - half < c.maxZ && p.y < c.top && p.y + height > 0) {
      if (dx > 0) p.x = c.minX - half; else if (dx < 0) p.x = c.maxX + half;
    }
  }
  p.z += dz;
  for (const c of colliders) {
    if (c.top <= p.y + 0.05 || p.y + height <= 0.05) continue;
    if (p.x + half > c.minX && p.x - half < c.maxX && p.z + half > c.minZ && p.z - half < c.maxZ && p.y < c.top && p.y + height > 0) {
      if (dz > 0) p.z = c.minZ - half; else if (dz < 0) p.z = c.maxZ + half;
    }
  }
  p.y += dy;
  if (p.y <= 0) { p.y = 0; onGround = true; }
  else {
    for (const c of colliders) {
      if (p.x + half > c.minX && p.x - half < c.maxX && p.z + half > c.minZ && p.z - half < c.maxZ) {
        if (dy < 0 && p.y < c.top && p.y + height > c.top) { p.y = c.top; onGround = true; }
        else if (dy > 0 && p.y + height > 0 && p.y < c.top) { /* head bump: no ceilings here */ }
      }
    }
  }
  return onGround;
}

// Ray vs AABB list (slab test). Returns nearest hit distance or Infinity.
export function wallRay(ox, oy, oz, dx, dy, dz, maxD, colliders) {
  let best = maxD;
  for (const c of colliders) {
    let t0 = 0, t1 = best;
    // X slab
    let inv = 1 / (dx || 1e-9);
    let a = (c.minX - ox) * inv, b = (c.maxX - ox) * inv;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) continue;
    inv = 1 / (dz || 1e-9);
    a = (c.minZ - oz) * inv; b = (c.maxZ - oz) * inv;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) continue;
    // Y slab: box spans y 0..top
    inv = 1 / (dy || 1e-9);
    a = (0 - oy) * inv; b = (c.top - oy) * inv;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1 || t1 < 0) continue;
    if (t0 >= 0 && t0 < best) best = t0;
  }
  return best;
}

// Ray vs sphere. Returns hit distance or -1.
export function sphereRay(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const ex = cx - ox, ey = cy - oy, ez = cz - oz;
  const tca = ex * dx + ey * dy + ez * dz;
  if (tca < 0) return -1;
  const d2 = ex * ex + ey * ey + ez * ez - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  return tca - Math.sqrt(r2 - d2);
}

export function hasSight(ax, ay, az, bx, by, bz, colliders) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 0.001) return true;
  return wallRay(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, colliders) >= d - 0.05;
}

// BFS over the waypoint graph; returns point indices from `from` to `to`.
export function routePath(from, to) {
  if (from === to) return [to];
  const prev = new Array(POINTS.length).fill(-1);
  const q = [from]; prev[from] = from;
  while (q.length) {
    const n = q.shift();
    for (const [a, b] of LINKS) {
      const m = a === n ? b : b === n ? a : -1;
      if (m >= 0 && prev[m] === -1) { prev[m] = n; if (m === to) { q.length = 0; break; } q.push(m); }
    }
  }
  if (prev[to] === -1) return [to];
  const path = [to];
  let n = to;
  while (n !== from) { n = prev[n]; path.unshift(n); }
  return path;
}

export function closestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < POINTS.length; i++) {
    const dx = POINTS[i][0] - x, dz = POINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
