// Screenshot setups: deterministic scenes for the four dossier images.
// Each one places the player, the bots and the bomb by hand, runs the sim a
// fixed number of steps so poses settle, then freezes the world — the frame
// the camera takes is the same every time. No pointer lock, no menu.
import { grantWeapon, ARSENAL } from './state.js';
import { ZONES } from './world.js';

function equip(G, id, mag) {
  const p = G.player;
  grantWeapon(p, id);
  p.cur = id; p.mag[id] = mag ?? ARSENAL[id].mag; p.reserve[id] = ARSENAL[id].reserve;
}

function poseBot(G, i, x, z, yaw, hp) {
  const b = G.fighters[i];
  if (!b) return;
  b.pos.x = x; b.pos.z = z; b.pos.y = 0;
  b.yaw = yaw; b.pitch = 0; b.hp = hp ?? 100; b.alive = true;
  b.brain.target = null; b.brain.state = 'hold'; b.brain.route = [];
}

function facePoint(G, tx, tz) {
  const p = G.player;
  p.yaw = Math.atan2(-(tx - p.pos.x), -(tz - p.pos.z));
  p.pitch = 0.01;
}

export function stageShot(G, name) {
  const p = G.player;
  p.alive = true; p.hp = 100;
  G.demo = { name, steps: 90, frozen: false };
  G.phase = 'live'; G.phaseT = 84;
  G.banner = { title: '', sub: '', until: 0 }; // clear the match-start banner
  if (name === 'cover') {
    // Mid-round firefight: Embers pushing through the mid double doors.
    G.round = 3; G.score = { w: 2, r: 1 }; G.money = 1250; G.kills = 3;
    p.pos.x = 6; p.pos.z = 4; p.pos.y = 0;
    equip(G, 'ar77', 25);
    facePoint(G, -2, -4);
    poseBot(G, 0, -1, -3, -2.36);                 // Ember through the doors
    poseBot(G, 1, 2, -5, -2.0);                   // Ember right behind
    poseBot(G, 2, -6, -8, -2.5, 62);              // Ember hurt, falling back
    poseBot(G, 3, 14, 12, Math.PI);               // Ember holding B
    poseBot(G, 4, 0, 1, -2.6);                    // Warden teammate covering mid
    poseBot(G, 5, 10, 6, Math.PI * 0.75);         // Warden teammate on B
  } else if (name === 'buy') {
    // Buy phase at defender spawn, shop open, money to spend.
    G.round = 1; G.score = { w: 0, r: 0 }; G.money = 2900; G.kills = 0;
    G.phase = 'buy'; G.phaseT = 12;
    p.pos.x = 20; p.pos.z = -2; p.pos.y = 0;
    equip(G, 'p9', 12);
    facePoint(G, 0, 0);
    poseBot(G, 4, 18, -6, Math.PI * 0.6);
    poseBot(G, 5, 18, 4, Math.PI * 0.4);
    G.demo.overlay = 'buy';
  } else if (name === 'plant') {
    // Charge live at site A, fuse burning, player peeking the site.
    G.round = 4; G.score = { w: 2, r: 2 }; G.money = 950; G.kills = 5;
    G.bomb.state = 'planted'; G.bomb.site = 'A';
    G.bomb.x = ZONES.A.x; G.bomb.z = ZONES.A.z; G.bomb.fuse = 18;
    p.pos.x = -6; p.pos.z = -8; p.pos.y = 0; p.hp = 64;
    equip(G, 'ar77', 14);
    facePoint(G, -16, -12);
    poseBot(G, 0, -14, -13, Math.PI * 0.85);         // Ember guarding the charge
    poseBot(G, 1, -19, -9, Math.PI * 0.6, 45);       // Ember hurt behind the silo
    poseBot(G, 4, -14, -6, 0.32);                    // Warden teammate pushing in
    poseBot(G, 5, 12, 8, Math.PI);
  } else if (name === 'end') {
    // Round won, banner up, scoreboard state visible.
    G.round = 5; G.score = { w: 3, r: 1 }; G.money = 2150; G.kills = 7;
    G.phase = 'roundEnd'; G.phaseT = 4;
    G.banner = { title: 'ROUND WON', sub: 'Ember squad eliminated — site held', until: 1e9 };
    p.pos.x = 0; p.pos.z = 2; p.pos.y = 0;
    equip(G, 'lw50', 4);
    facePoint(G, -10, -10);
    poseBot(G, 0, -12, -10, 0, 0);
    G.fighters[0].alive = false; G.fighters[0].hp = 0;
    G.fighters[1].alive = false; G.fighters[1].hp = 0;
    G.fighters[2].alive = false; G.fighters[2].hp = 0;
    G.fighters[3].alive = false; G.fighters[3].hp = 0;
    poseBot(G, 4, -4, -4, Math.PI * 0.5);
    poseBot(G, 5, 6, 4, Math.PI * 0.75);
    G.feed.unshift({ a: 'D. Marsh', b: 'S. Marek', wp: 'lw50', aTeam: 'w', bTeam: 'r', t: 0 });
    G.feed.unshift({ a: 'A. Sable', b: 'M. Voss', wp: 'ar77', aTeam: 'w', bTeam: 'r', t: 0 });
  }
  // Grenade count shown on the HUD for the combat shots.
  if (name === 'cover' || name === 'plant') p.grenades = 1;
}
