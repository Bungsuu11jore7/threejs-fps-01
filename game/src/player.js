// The player: acceleration-based movement with crouch, jump, walk-slow and
// AABB collision; firing, reload, weapon switching, scope and grenade input.
// One fixed step of input in, one fixed step of state out.
import { ARSENAL, DEFUSE_LEN, clampN } from './state.js';
import { slideBody } from './world.js';
import { shoot, beginReload, completeReload, lobGrenade, eyeY } from './weapons.js';
import { sound } from './audio.js';

const WALK_V = 4.3, CROUCH_V = 2.1, SLOW_V = 2.2, ACCEL_G = 42, ACCEL_AIR = 9, DRAG = 11, JUMP = 5.4, GRAVITY = 14;

export function stepPlayer(G, pad, dt, vfx) {
  const p = G.player;
  if (!p.alive) return;
  // Look: mouse deltas, recoil recovery, scope sensitivity.
  const sens = p.scoped ? 0.0011 : 0.0022;
  p.yaw -= pad.lookDX * sens;
  p.pitch = clampN(p.pitch - pad.lookDY * sens + p.recoilP * 0.12, -1.45, 1.45);
  p.recoilP = Math.max(0, p.recoilP - dt * 0.09);
  p.recoilY = Math.max(0, p.recoilY - dt * 0.05);
  p.yaw += p.recoilY * 0.02;
  p.bloom = Math.max(0, p.bloom - dt * 0.05);
  if (p.fireCd > 0) p.fireCd -= dt;

  const wantCrouch = pad.keys.has('crouch');
  if (wantCrouch !== p.crouch) p.crouch = wantCrouch;
  const speed = p.crouch ? CROUCH_V : pad.keys.has('walk') ? SLOW_V : WALK_V;
  const fwd = (pad.keys.has('up') ? 1 : 0) - (pad.keys.has('down') ? 1 : 0);
  const str = (pad.keys.has('right') ? 1 : 0) - (pad.keys.has('left') ? 1 : 0);
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  // Forward is -Z rotated by yaw; right is +X rotated by yaw.
  const mx = (-sy * fwd + cy * str), mz = (-cy * fwd - sy * str);
  const ml = Math.hypot(mx, mz) || 1;
  const accel = p.onGround ? ACCEL_G : ACCEL_AIR;
  p.vel.x += (mx / ml) * accel * dt * (fwd || str ? 1 : 0);
  p.vel.z += (mz / ml) * accel * dt * (fwd || str ? 1 : 0);
  if (p.onGround) {
    const f = Math.max(0, 1 - DRAG * dt);
    if (!fwd && !str) { p.vel.x *= f; p.vel.z *= f; }
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > speed) { p.vel.x *= speed / sp; p.vel.z *= speed / sp; }
  }
  p.vel.y -= GRAVITY * dt;
  if (pad.pressed.has('jump') && p.onGround && !p.crouch) { p.vel.y = JUMP; p.onGround = false; }
  const height = p.crouch ? 1.15 : 1.7;
  p.onGround = slideBody(p.pos, 0.35, height, p.vel.x * dt, p.vel.y * dt, p.vel.z * dt, G.world.colliders);
  if (p.onGround && p.vel.y < 0) p.vel.y = 0;

  // Footstep ticks while moving on the ground; quiet when crouched or walking slow.
  if (p.onGround && Math.hypot(p.vel.x, p.vel.z) > 2 && G.time - (p._stepAt || 0) > (p.crouch || pad.keys.has('walk') ? 0.62 : 0.38)) {
    p._stepAt = G.time;
    sound.step();
  }

  // Weapons.
  if (pad.pressed.has('reload')) beginReload(G, p);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) completeReload(p);
  }
  for (let d = 1; d <= 5; d++) {
    if (pad.pressed.has('digit' + d)) {
      const id = ['p9', 'ar77', 'vk9', 'sg12', 'lw50'][d - 1];
      if (p.weapons[id] && p.cur !== id) {
        p.cur = id; p.scoped = false; p.reloading = 0;
      }
    }
  }
  if (pad.pressed.has('grenade')) lobGrenade(G, p, vfx);
  const wantFire = ARSENAL[p.cur].auto ? pad.mouseDown : (pad.mouseDownEdge || pad.mouseDown);
  if (wantFire && p.reloading <= 0) shoot(G, p, vfx);
  // Scope toggle on right mouse (marksman rifle only).
  if (ARSENAL[p.cur].zoom > 1) {
    p.scoped = pad.mouseRight;
  } else p.scoped = false;

  // Defuse: hold E inside the planted site.
  const b = G.bomb;
  if (b.state === 'planted' && p.alive) {
    const dx = p.pos.x - b.x, dz = p.pos.z - b.z;
    if (dx * dx + dz * dz < 2.4 * 2.4 && pad.keys.has('use')) {
      b.defuseT += dt;
      if (Math.floor(b.defuseT * 4) !== Math.floor((b.defuseT - dt) * 4)) sound.defuseTick();
      if (b.defuseT >= DEFUSE_LEN) { b.state = 'defused'; b.defuser = p; }
    } else b.defuseT = Math.max(0, b.defuseT - dt * 2);
  } else b.defuseT = 0;
}

export function placePlayer(G) {
  const p = G.player;
  p.pos.x = 20; p.pos.z = -2; p.pos.y = 0;
  p.vel.x = p.vel.y = p.vel.z = 0;
  p.yaw = Math.PI / 2; // face west, toward mid
  p.pitch = 0; p.hp = 100; p.alive = true;
  p.reloading = 0; p.fireCd = 0; p.bloom = 0; p.scoped = false;
}
