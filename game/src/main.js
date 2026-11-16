// EMBERLINE: bootstrap, fixed-step loop, camera, viewmodel, overlays.
// The sim (state.js + player/bots/rounds) runs at a fixed 60 Hz, decoupled
// from rendering; this file only wires input, light, camera and DOM to it.
import * as THREE from 'three';
import { freshState, STEP, mulberry, ARSENAL, clampN } from './state.js';
import { makeWorld } from './world.js';
import { buildTextures, buildMaterials } from './palette.js';
import { bindInput } from './input.js';
import { stepPlayer } from './player.js';
import { buildFx, stepGrenades, eyeY } from './weapons.js';
import { stepBot, makeRig, poseRig } from './bots.js';
import { openMatch, advanceRound, purchase } from './rounds.js';
import { mountHud, drawHud, showPanel } from './hud.js';
import { enableAudio } from './audio.js';
import { stageShot } from './shots.js';

const G = freshState();
G._rng = mulberry(G.seed);
window.__emberlineState = G;

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc98a52, 30, 130);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);
// A soft fill light riding with the camera, so the viewmodel reads as a gun
// instead of a black wedge when the sun is behind it.
const vmLight = new THREE.PointLight(0xfff2dd, 2.2, 2.2, 1.4);
vmLight.position.set(0.2, 0.35, -0.3);
camera.add(vmLight);

const hemi = new THREE.HemisphereLight(0x8fa3c7, 0x8a6a44, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 2.3);
sun.position.set(18, 40, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 120; sun.shadow.bias = -0.0004;
scene.add(sun);
for (const [x, z] of [[-16, -12], [16, 12]]) {
  const lamp = new THREE.PointLight(0xffe6b0, 14, 18, 1.8);
  lamp.position.set(x, 5.2, z);
  scene.add(lamp);
}
// The low sun itself: a bright disc and a soft halo low over the west wall,
// so the dusk reads in the sky instead of only in the fog colour.
const sunDir = new THREE.Vector3(18, 40, 26).normalize();
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(6, 24),
  new THREE.MeshBasicMaterial({ color: 0xffe9c0, fog: false }),
);
sunDisc.position.copy(sunDir).multiplyScalar(132);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);
const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffc06a, transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
sunHalo.scale.set(42, 42, 1);
sunHalo.position.copy(sunDir).multiplyScalar(130);
scene.add(sunHalo);
// Drifting dust motes over the yard: positions are a pure function of G.time,
// so a frozen screenshot frame is deterministic.
const DUST_N = 220;
const dustBase = new Float32Array(DUST_N * 3);
const dustSeed = mulberry(99);
for (let i = 0; i < DUST_N; i++) {
  dustBase[i * 3] = (dustSeed() - 0.5) * 52;
  dustBase[i * 3 + 1] = 0.3 + dustSeed() * 5.5;
  dustBase[i * 3 + 2] = (dustSeed() - 0.5) * 44;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xe8c890, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false }));
scene.add(dust);
function updateDust(t) {
  const p = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) {
    const bx = dustBase[i * 3], by = dustBase[i * 3 + 1], bz = dustBase[i * 3 + 2];
    p[i * 3] = bx + Math.sin(t * 0.11 + i * 1.7) * 1.6 + t * 0.12 % 4;
    p[i * 3 + 1] = by + Math.sin(t * 0.23 + i * 2.3) * 0.35;
    p[i * 3 + 2] = bz + Math.cos(t * 0.09 + i) * 1.6;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

const maps = buildTextures();
const surf = buildMaterials(maps);
G.world = makeWorld(scene, surf);
const vfx = buildFx(scene);
let markT = -99;
vfx.hitmark = () => { markT = G.time; };

let rigs = [];
function remakeRigs() {
  for (const r of rigs) scene.remove(r.group);
  rigs = G.fighters.map((f) => {
    const rig = makeRig(f.team, surf);
    scene.add(rig.group);
    return rig;
  });
}

// --- viewmodel: a low-poly rifle parented to the camera ---------------------
// Receiver, handguard with top rail, barrel + suppressor, stock, grip,
// foregrip, rear sight and a scope that only the marksman rifle shows.
const vmMat = new THREE.MeshStandardMaterial({ color: 0x565e66, roughness: 0.38, metalness: 0.7 });
const vm = new THREE.Group();
const vmScope = new THREE.Group();
{
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), vmMat);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.3), surf.dark);
  handguard.position.set(0, 0.02, -0.32);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.42), vmMat);
  rail.position.set(0, 0.085, -0.22);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10), vmMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.56);
  const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.16, 10), surf.gun);
  suppressor.rotation.x = Math.PI / 2; suppressor.position.set(0, 0.03, -0.76);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.2), surf.dark);
  stock.position.set(0, -0.01, 0.32);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), surf.dark);
  grip.position.set(0, -0.13, 0.08); grip.rotation.x = 0.35;
  const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.06), surf.dark);
  foregrip.position.set(0, -0.09, -0.38); foregrip.rotation.x = 0.15;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.1), surf.gunAccent);
  sight.position.set(0, 0.1, -0.1);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), surf.gun);
  mag.position.set(0, -0.13, -0.05); mag.rotation.x = 0.15;
  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), surf.gun);
  scopeTube.rotation.x = Math.PI / 2; scopeTube.position.set(0, 0.11, -0.05);
  const scopeGlass = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12),
    new THREE.MeshBasicMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.85 }));
  scopeGlass.position.set(0, 0.11, 0.065);
  vmScope.add(scopeTube, scopeGlass);
  vmScope.visible = false;
  vm.add(receiver, handguard, rail, barrel, suppressor, stock, grip, foregrip, sight, mag, vmScope);
  vm.scale.setScalar(0.72);
  vm.position.set(0.3, -0.27, -0.55);
  camera.add(vm);
}
const flashQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(0.34, 0.34),
  new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
);
flashQuad.position.set(0.3, -0.22, -1.02);
camera.add(flashQuad);
let flashClock = 0;

// Bomb mesh: a charge box with a blinking beacon, shown while planting/planted.
const bombMesh = new THREE.Group();
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), surf.dark);
  box.castShadow = true;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 2 }));
  beacon.position.y = 0.18;
  bombMesh.add(box, beacon);
  bombMesh.visible = false;
  scene.add(bombMesh);
}
// Grenade meshes (pool of four small spheres).
const grenadeMeshes = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), surf.gunAccent);
  m.visible = false; scene.add(m); grenadeMeshes.push(m);
}

// --- input, HUD, overlays ----------------------------------------------------
const pad = bindInput(renderer.domElement);
const ui = mountHud();
let shopOpen = false;
let lastPhase = G.phase;

function setPauseCopy(title, copy, button) {
  document.getElementById('menu-title').textContent = title;
  document.getElementById('menu-copy').textContent = copy;
  document.getElementById('play').textContent = button;
}
document.getElementById('play').addEventListener('click', () => {
  enableAudio();
  if (G.phase === 'menu' || G.phase === 'matchEnd') openMatch(G);
  G.paused = false;
  showPanel('none');
  if (G.phase === 'buy') { shopOpen = true; showPanel('buy'); }
  pad.lock();
});
document.getElementById('again').addEventListener('click', () => {
  enableAudio();
  openMatch(G);
  showPanel('none');
  shopOpen = true; showPanel('buy');
  pad.lock();
});
pad.onLockChange = (locked) => {
  if (!locked && (G.phase === 'live' || G.phase === 'buy') && !G.demo) {
    G.paused = true;
    setPauseCopy('Paused', 'Pointer released. Click to jump back into the round — the fight waits for you.', 'Resume round');
    showPanel('menu');
  }
};
pad.onFirstGesture = () => enableAudio();

// --- demo / screenshot mode --------------------------------------------------
const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) {
  G.demo = { name: shotName, steps: 0, frozen: false };
  openMatch(G);
  remakeRigs();
  stageShot(G, shotName);
  showPanel('none');
  if (G.demo.overlay === 'buy') { shopOpen = true; showPanel('buy'); }
}

// --- main loop ---------------------------------------------------------------
let lastT = performance.now() / 1000;
let acc = 0;
let bobClock = 0;

function tick(dt) {
  G.time += dt;
  advanceRound(G, dt);
  // Phase transitions, once each: open the shop on a new buy phase, show the
  // match sheet when the match ends, rebuild bot rigs on a fresh spawn.
  if (G.phase !== lastPhase) {
    if (G.phase === 'buy' && !G.demo) { shopOpen = true; showPanel('buy'); }
    if (G.phase === 'matchEnd') { showPanel('end'); pad.unlock(); }
    lastPhase = G.phase;
  }
  if (rigs.length !== G.fighters.length) remakeRigs();
  if (G.phase === 'live' || G.phase === 'buy') {
    if (pad.pressed.has('buy') && G.phase === 'buy') {
      shopOpen = !shopOpen;
      showPanel(shopOpen ? 'buy' : 'none');
    }
    if (shopOpen && G.phase === 'buy') {
      for (let d = 1; d <= 6; d++) {
        if (pad.pressed.has('digit' + d)) {
          purchase(G, d === 6 ? 'grenade' : ['p9', 'ar77', 'vk9', 'sg12', 'lw50'][d - 1]);
        }
      }
    }
    stepPlayer(G, pad, dt, vfx);
    if (G.phase === 'live') {
      for (let i = 0; i < G.fighters.length; i++) stepBot(G, G.fighters[i], dt, vfx, i);
    }
    stepGrenades(G, dt, vfx);
  }
}

function render(nowMs) {
  requestAnimationFrame(render);
  const now = nowMs / 1000;
  let dt = Math.min(0.1, now - lastT);
  lastT = now;
  const frozen = G.demo && G.demo.frozen;
  if (!G.paused && G.phase !== 'menu' && !frozen) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      tick(STEP);
      acc -= STEP;
      steps++;
      if (steps === 1) pad.endStep();
      if (G.demo) {
        G.demo.steps--;
        if (G.demo.steps <= 0) { G.demo.frozen = true; document.title = 'shot-ready'; window.__ready = true; break; }
      }
    }
    if (steps >= 5) acc = 0;
  }
  if (G.demo && G.demo.frozen && document.title !== 'shot-ready') { document.title = 'shot-ready'; window.__ready = true; }

  // --- render ----------------------------------------------------------------
  const p = G.player;
  const shake = vfx.takeShake();
  const shX = shake ? (Math.random() - 0.5) * shake * 0.06 : 0;
  const shY = shake ? (Math.random() - 0.5) * shake * 0.06 : 0;
  camera.position.set(p.pos.x + shX, p.pos.y + eyeY(p) + shY, p.pos.z);
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch + p.recoilP * 0.35;
  camera.rotation.z = 0;
  const wantFov = p.scoped ? 75 / ARSENAL[p.cur].zoom : 75;
  if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * 0.25; camera.updateProjectionMatrix(); }
  // Viewmodel bob + recoil + reload dip; the scope rides only on the Falcon.
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && speed > 0.5) bobClock += dt * speed * 1.6;
  const bobY = Math.sin(bobClock * 2) * 0.008 * Math.min(1, speed / 4);
  const bobX = Math.cos(bobClock) * 0.006 * Math.min(1, speed / 4);
  const recoilKick = p.recoilP * 0.9;
  vm.position.set(0.3 + bobX, -0.27 + bobY - (p.reloading > 0 ? 0.09 : 0), -0.55 + recoilKick);
  vm.visible = p.alive;
  vm.rotation.x = p.recoilP * 0.4;
  vmScope.visible = p.cur === 'lw50';
  flashClock = Math.max(0, flashClock - dt);
  if (G.time - p.lastShotAt < 0.05 && p.alive) flashClock = 0.05;
  flashQuad.material.opacity = flashClock > 0 ? 0.9 : 0;
  flashQuad.rotation.z = Math.random() * Math.PI;
  flashQuad.visible = p.alive;
  // Bots, bomb, grenades, dust.
  for (let i = 0; i < G.fighters.length; i++) {
    if (rigs[i]) poseRig(rigs[i], G.fighters[i]);
  }
  const b = G.bomb;
  bombMesh.visible = b.state === 'planting' || b.state === 'planted';
  if (bombMesh.visible) {
    bombMesh.position.set(b.x, 0.14, b.z);
    bombMesh.children[1].material.emissiveIntensity = (b.state === 'planted' && Math.floor(G.time * 3) % 2 === 0) ? 3.5 : 0.6;
  }
  for (let i = 0; i < grenadeMeshes.length; i++) {
    const g = G.grenades[i];
    grenadeMeshes[i].visible = !!g;
    if (g) grenadeMeshes[i].position.set(g.x, g.y, g.z);
  }
  updateDust(G.time);
  // HUD + overlays.
  const w = ARSENAL[p.cur];
  const moving = Math.min(1, speed / 4.3);
  const spreadPx = (w.spread + w.moveSpread * moving + p.bloom) * 1400;
  drawHud(G, spreadPx, markT);
  const hurt = p.alive ? 0 : 0.5;
  ui.vignette.style.opacity = String(clampN((1 - p.hp / 55) * 0.85, 0, 0.85) + hurt * 0.4);
  vfx.update(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

requestAnimationFrame(render);
