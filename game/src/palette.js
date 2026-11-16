// Look plan: cold dusk over a desert solar refinery. Indigo sky, amber low sun,
// sand, teal-painted steel, rust orange, deep shade. Every texture is painted
// once at boot on a canvas — no image assets anywhere in the game.
import * as THREE from 'three';

export const TINT = {
  sand: 0xc2a06b, sandDark: 0x9a7d50, ground: 0xb59a67,
  wall: 0x4d6a6e, wallDark: 0x395052, teal: 0x2f8f88, tealBright: 0x39c2b8,
  rust: 0xc25e2e, rustBright: 0xff8c2e, hazard: 0xe8b93a,
  ember: 0xc1442e, warden: 0x2e86ab, dark: 0x1a1712,
  skyTop: 0x232c4a, skyMid: 0x7a5a6e, skyLow: 0xe8a35c,
  sun: 0xffd9a0, lamp: 0xffe6b0, panel: 0x1d2f4d,
};

function paintTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function fleck(ctx, w, h, n, colors, s0, s1, rnd) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = s0 + rnd() * (s1 - s0);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

export function buildTextures() {
  let seed = 9182;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const ground = paintTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b59a67'; ctx.fillRect(0, 0, w, h);
    fleck(ctx, w, h, 4800, ['#a8895a', '#c7ab7d', '#8f7448', '#d0b586'], 1, 3, rnd);
    // Wind-blown streaks and a darker worn patch where boots cross mid.
    ctx.strokeStyle = 'rgba(90,70,40,.25)';
    for (let i = 0; i < 30; i++) {
      ctx.beginPath(); const y = rnd() * h; ctx.moveTo(0, y); ctx.lineTo(w, y + (rnd() - .5) * 30); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70,52,30,.12)';
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.5, 150, 90, 0.4, 0, 7); ctx.fill();
    // Faint tyre arcs crossing the yard.
    ctx.strokeStyle = 'rgba(60,44,24,.28)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, 190, 0.6, 2.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, 205, 0.6, 2.4); ctx.stroke();
  }, 10, 8);
  const metal = paintTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4d6a6e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let y = 32; y < h; y += 64) ctx.fillRect(0, y, w, 2);
    fleck(ctx, w, h, 1000, ['#557478', '#42585c', '#5d8287'], 1, 3, rnd);
    // Rust weep running down from the top edge.
    ctx.fillStyle = 'rgba(194,94,46,.35)';
    for (let i = 0; i < 11; i++) {
      const x = rnd() * w; ctx.fillRect(x, 0, 3 + rnd() * 5, 40 + rnd() * 90);
    }
    ctx.fillStyle = '#c25e2e'; ctx.fillRect(0, 0, w, 10);
  });
  const crate = paintTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a5a34'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(w - 6, h - 6); ctx.moveTo(w - 6, 6); ctx.lineTo(6, h - 6); ctx.stroke();
    fleck(ctx, w, h, 650, ['#6b4d2c', '#8a6a42', '#5d4126'], 1, 3, rnd);
    ctx.fillStyle = 'rgba(232,185,58,.85)';
    ctx.font = 'bold 30px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('HLX-9', w / 2, h / 2 + 12);
  });
  const hazard = paintTex(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8b93a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a1712';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, h); ctx.fill();
    }
  }, 2, 1);
  // Solar panel face: deep blue cells under a silver grid.
  const panel = paintTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1d2f4d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#24405f';
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) ctx.fillRect(x + 2, y + 2, 28, 28);
    ctx.strokeStyle = 'rgba(200,220,255,.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(w, i * 32); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.25); ctx.lineTo(0, h); ctx.fill();
  });
  // Vertical dusk gradient for the sky dome: indigo top, amber horizon.
  const sky = paintTex(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#232c4a'); g.addColorStop(0.45, '#5d4a68'); g.addColorStop(0.72, '#c97e4a'); g.addColorStop(1, '#e8a35c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  return { ground, metal, crate, hazard, sky, panel };
}

export function buildMaterials(tex) {
  return {
    ground: new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 0.95, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.7, metalness: 0.35 }),
    wallDark: new THREE.MeshStandardMaterial({ color: TINT.wallDark, roughness: 0.8, metalness: 0.3 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9, metalness: 0.05 }),
    rust: new THREE.MeshStandardMaterial({ color: TINT.rust, roughness: 0.6, metalness: 0.5 }),
    teal: new THREE.MeshStandardMaterial({ color: TINT.teal, roughness: 0.55, metalness: 0.4 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8, metalness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9, metalness: 0.1 }),
    panel: new THREE.MeshStandardMaterial({ color: TINT.panel, roughness: 0.5, metalness: 0.25 }),
    lamp: new THREE.MeshStandardMaterial({ color: TINT.lamp, emissive: TINT.lamp, emissiveIntensity: 1.6 }),
    warden: new THREE.MeshStandardMaterial({ color: TINT.warden, roughness: 0.6, metalness: 0.2 }),
    ember: new THREE.MeshStandardMaterial({ color: TINT.ember, roughness: 0.6, metalness: 0.2 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.2, metalness: 0.8 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.75 }),
    gunAccent: new THREE.MeshStandardMaterial({ color: TINT.rustBright, roughness: 0.5, metalness: 0.5 }),
    sky: new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, fog: false, depthWrite: false }),
  };
}
