// Gunplay: hitscan against real bodies (head sphere pays double), spread that
// grows while moving and firing, recoil with recovery, grenades with bounce and
// area damage. All hit math is ray-vs-AABB (walls) and ray-vs-sphere (fighters),
// so a shot can only land where the eye can actually see.
import * as THREE from 'three';
import { ARSENAL, clampN, wobble, mulberry } from './state.js';
import { wallRay, sphereRay } from './world.js';
import { sound } from './audio.js';

const EYE_STAND = 1.62, EYE_CROUCH = 1.15;
export function eyeY(f) { return f.crouch ? EYE_CROUCH : EYE_STAND; }
const SKULL_R = 0.21, TORSO_R = 0.44;
const _v = { x: 0, y: 0, z: 0 };

export function aimVector(f, out) {
  const cp = Math.cos(f.pitch), sp = Math.sin(f.pitch);
  const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
  // yaw=0 faces -Z (three.js convention): dir = (-sin yaw * cos pitch, sin pitch, -cos yaw * cos pitch)
  out.x = -sy * cp; out.y = sp; out.z = -cy * cp;
  return out;
}

// Resolve one hitscan pellet. Returns {dist, fighter, head, wall}.
export function castShot(G, from, dir, maxD, shooter) {
  const wallD = wallRay(from.x, from.y, from.z, dir.x, dir.y, dir.z, maxD, G.world.colliders);
  let best = wallD, bestF = null, bestHead = false;
  const targets = shooter.isPlayer ? G.fighters : [G.player, ...G.fighters.filter((b) => b !== shooter)];
  for (const t of targets) {
    if (!t.alive || t === shooter) continue;
    const h = eyeY(t);
    const headY = t.pos.y + h + 0.12;
    const chestY = t.pos.y + h - 0.35;
    const th = sphereRay(from.x, from.y, from.z, dir.x, dir.y, dir.z, t.pos.x, headY, t.pos.z, SKULL_R);
    if (th >= 0 && th < best) { best = th; bestF = t; bestHead = true; }
    const tb = sphereRay(from.x, from.y, from.z, dir.x, dir.y, dir.z, t.pos.x, chestY, t.pos.z, TORSO_R);
    if (tb >= 0 && tb < best) { best = tb; bestF = t; bestHead = false; }
  }
  return { dist: best, fighter: bestF, head: bestHead, wall: bestF === null && best < maxD };
}

export function hurtFighter(G, target, dmg, attacker, weaponId, head) {
  if (!target.alive) return false;
  target.hp -= dmg;
  if (target.isPlayer) sound.hurt();
  else if (attacker && attacker.isPlayer) sound.hit();
  if (target.hp <= 0) {
    target.hp = 0; target.alive = false;
    const killer = attacker ? attacker.name : '—';
    G.feed.unshift({ a: killer, b: target.name, wp: weaponId, aTeam: attacker ? attacker.team : 'w', bTeam: target.team, t: G.time });
    if (G.feed.length > 5) G.feed.pop();
    if (attacker && attacker.isPlayer) { G.money += 300; G.kills++; sound.kill(); }
    return true;
  }
  return false;
}

// Fire one trigger pull for fighter f. vfx: {tracer, muzzle, impact, shake, flash}.
export function shoot(G, f, vfx) {
  const w = ARSENAL[f.cur];
  if (!w || f.reloading > 0 || f.fireCd > 0) return false;
  if (f.mag[f.cur] <= 0) { sound.dry(); f.fireCd = 0.25; return false; }
  const r = G._rng;
  f.mag[f.cur]--;
  f.fireCd = w.rate;
  f.lastShotAt = G.time;
  const speed = Math.hypot(f.vel.x, f.vel.z);
  const moving = speed / 4.3;
  const spread = w.spread + w.moveSpread * moving + f.bloom;
  f.bloom = Math.min(0.05, f.bloom + (w.id === 'sg12' ? 0.02 : 0.006));
  f.recoilP += w.recoil * (f.isPlayer ? 1 : 0.4);
  const ex = f.pos.x, ey = f.pos.y + eyeY(f), ez = f.pos.z;
  const mz = { x: ex, y: ey - 0.12, z: ez };
  aimVector(f, _v);
  // Muzzle world position: a step forward and down from the eye.
  mz.x += _v.x * 0.55; mz.y += _v.y * 0.55 - 0.1; mz.z += _v.z * 0.55;
  vfx.muzzle(mz, _v);
  if (f.isPlayer) sound.shot(w.id); else sound.distantShot();
  G.noise.push({ x: f.pos.x, z: f.pos.z, t: G.time, loud: w.id === 'lw50' || w.id === 'sg12' ? 26 : 18 });
  let killed = false;
  for (let p = 0; p < w.pellets; p++) {
    const dir = {
      x: _v.x + wobble(r) * spread, y: _v.y + wobble(r) * spread, z: _v.z + wobble(r) * spread,
    };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    dir.x /= len; dir.y /= len; dir.z /= len;
    const hit = castShot(G, { x: ex, y: ey, z: ez }, dir, w.range * 2.2, f);
    const hx = ex + dir.x * hit.dist, hy = ey + dir.y * hit.dist, hz = ez + dir.z * hit.dist;
    vfx.tracer(mz, { x: hx, y: hy, z: hz }, f.team === 'w' ? 0xffe6b0 : 0xff9a7a);
    if (hit.fighter) {
      const fall = clampN(1 - Math.max(0, hit.dist - w.range) / w.range, 0.5, 1);
      const dmg = Math.round(w.dmg * (hit.head ? w.headMul : 1) * fall);
      if (hurtFighter(G, hit.fighter, dmg, f, w.id, hit.head)) killed = true;
      if (f.isPlayer) vfx.hitmark(hit.head);
    } else if (hit.wall) {
      vfx.impact({ x: hx, y: hy, z: hz });
    }
  }
  if (f.isPlayer && killed) vfx.shake(0.12);
  return true;
}

export function beginReload(G, f) {
  const w = ARSENAL[f.cur];
  if (!w || f.reloading > 0 || f.mag[f.cur] >= w.mag) return;
  if (w.reserve !== Infinity && f.reserve[f.cur] <= 0) return;
  f.reloading = w.reload; f.reloadWeapon = f.cur;
  if (f.isPlayer) sound.reload();
}
export function completeReload(f) {
  const w = ARSENAL[f.reloadWeapon];
  if (!w) return;
  const need = w.mag - f.mag[f.reloadWeapon];
  if (w.reserve === Infinity) { f.mag[f.reloadWeapon] = w.mag; }
  else {
    const take = Math.min(need, f.reserve[f.reloadWeapon]);
    f.mag[f.reloadWeapon] += take; f.reserve[f.reloadWeapon] -= take;
  }
  f.reloading = 0; f.reloadWeapon = '';
}

export function lobGrenade(G, f, vfx) {
  if (f.grenades <= 0) return false;
  f.grenades--;
  aimVector(f, _v);
  const ex = f.pos.x, ey = f.pos.y + eyeY(f), ez = f.pos.z;
  G.grenades.push({
    x: ex + _v.x * 0.6, y: ey - 0.1, z: ez + _v.z * 0.6,
    vx: _v.x * 15 + f.vel.x * 0.5, vy: _v.y * 15 + 3.2, vz: _v.z * 15 + f.vel.z * 0.5,
    fuse: 2.0, bounced: false,
  });
  if (f.isPlayer) sound.step();
  return true;
}

export function stepGrenades(G, dt, vfx) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.vy -= 13 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    g.fuse -= dt;
    if (g.y <= 0.12) {
      if (Math.abs(g.vy) > 1.5) sound.bounce();
      g.y = 0.12; g.vy = -g.vy * 0.42; g.vx *= 0.7; g.vz *= 0.7; g.bounced = true;
    }
    // Cheap wall bounce: sample the collider list, reflect the dominant axis.
    for (const c of G.world.colliders) {
      if (g.y < c.top && g.x > c.minX - 0.12 && g.x < c.maxX + 0.12 && g.z > c.minZ - 0.12 && g.z < c.maxZ + 0.12) {
        const dxl = g.x - c.minX, dxr = c.maxX - g.x, dzl = g.z - c.minZ, dzr = c.maxZ - g.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl || m === dxr) g.vx = -g.vx * 0.45;
        else g.vz = -g.vz * 0.45;
        break;
      }
    }
    if (g.fuse <= 0) {
      G.grenades.splice(i, 1);
      explode(G, g, vfx);
    }
  }
}

function explode(G, g, vfx) {
  vfx.explosion({ x: g.x, y: Math.max(0.4, g.y), z: g.z });
  sound.explosion();
  const targets = [G.player, ...G.fighters];
  for (const t of targets) {
    if (!t.alive) continue;
    const dx = t.pos.x - g.x, dz = t.pos.z - g.z, dy = (t.pos.y + 0.9) - g.y;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 6.5) continue;
    const dmg = Math.round(105 * (1 - d / 6.5) + 12);
    hurtFighter(G, t, dmg, null, 'grenade', false);
  }
}

// --- tracer / impact pools (visuals; no allocation in the hot path) ----------
export function buildFx(scene) {
  const pool = [];
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    pool.push({ line, life: 0 });
  }
  const flashLight = new THREE.PointLight(0xffc06a, 0, 9, 1.6);
  scene.add(flashLight);
  const impacts = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    scene.add(m);
    impacts.push({ m, life: 0 });
  }
  // Dust puffs: soft billboards that swell and fade where bullets strike.
  const dust = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xc7ab7d, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.set(0.3, 0.3, 1);
    scene.add(s);
    dust.push({ s, life: 0 });
  }
  let ti = 0, ii = 0, di = 0, shakeAmt = 0;
  const vfx = {
    tracer(a, b, color) {
      const t = pool[ti]; ti = (ti + 1) % pool.length;
      const p = t.line.geometry.attributes.position.array;
      p[0] = a.x; p[1] = a.y; p[2] = a.z; p[3] = b.x; p[4] = b.y; p[5] = b.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(color);
      t.line.material.opacity = 0.9; t.life = 0.07;
    },
    impact(p) {
      const im = impacts[ii]; ii = (ii + 1) % impacts.length;
      im.m.position.set(p.x, p.y, p.z);
      im.m.lookAt(p.x, p.y + 1, p.z);
      im.m.material.opacity = 0.9; im.life = 0.18;
      const d = dust[di]; di = (di + 1) % dust.length;
      d.s.position.set(p.x, p.y, p.z);
      d.s.scale.set(0.3, 0.3, 1);
      d.s.material.opacity = 0.5; d.life = 0.5;
    },
    muzzle(p) { flashLight.position.set(p.x, p.y, p.z); flashLight.intensity = 26; },
    explosion(p) {
      flashLight.position.set(p.x, p.y + 0.5, p.z); flashLight.intensity = 90;
      vfx.shake(0.5);
    },
    shake(a) { shakeAmt = Math.max(shakeAmt, a); },
    hitmark() {},
    takeShake() { const a = shakeAmt; shakeAmt = 0; return a; },
    update(dt) {
      for (const t of pool) {
        if (t.life > 0) { t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9; }
      }
      for (const im of impacts) {
        if (im.life > 0) { im.life -= dt; im.m.material.opacity = Math.max(0, im.life / 0.18) * 0.9; }
      }
      for (const d of dust) {
        if (d.life > 0) {
          d.life -= dt;
          const k = 1 - Math.max(0, d.life / 0.5);
          d.s.scale.set(0.3 + k * 0.9, 0.3 + k * 0.9, 1);
          d.s.material.opacity = Math.max(0, d.life / 0.5) * 0.5;
        }
      }
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
    },
  };
  return vfx;
}

export { mulberry };
