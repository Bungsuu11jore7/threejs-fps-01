// All sound is synthesized with WebAudio: no audio assets, no network.
// Everything is guarded — in a headless render there may be no audio at all.
let ctx = null, master = null, noiseBuf = null;
function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}
export function enableAudio() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
function hiss(dur, filterFreq, gain, type = 'lowpass') {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}
function beep(freq, dur, gain, type = 'sine', slideTo = 0) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
export const sound = {
  shot(kind) {
    if (kind === 'sg12') { hiss(0.22, 900, 0.9); beep(90, 0.18, 0.5, 'sine', 45); }
    else if (kind === 'lw50') { hiss(0.3, 700, 1.0); beep(70, 0.28, 0.6, 'sine', 35); }
    else if (kind === 'vk9') { hiss(0.09, 1800, 0.5); beep(160, 0.07, 0.3, 'square', 90); }
    else if (kind === 'ar77') { hiss(0.12, 1400, 0.65); beep(130, 0.09, 0.35, 'square', 70); }
    else { hiss(0.09, 2000, 0.45); beep(190, 0.06, 0.25, 'square', 110); }
  },
  distantShot() { hiss(0.14, 500, 0.16); },
  dry() { beep(1400, 0.04, 0.12, 'square'); },
  reload() { beep(700, 0.05, 0.15, 'square'); setTimeout(() => beep(500, 0.05, 0.15, 'square'), 160); },
  hit() { beep(2400, 0.05, 0.2, 'square', 1800); },
  kill() { beep(880, 0.09, 0.22, 'square'); setTimeout(() => beep(1320, 0.12, 0.22, 'square'), 90); },
  hurt() { hiss(0.15, 300, 0.4); beep(110, 0.15, 0.3, 'sine', 60); },
  plantBeep() { beep(1200, 0.07, 0.2, 'square'); },
  plantStart() { beep(520, 0.1, 0.2, 'square'); setTimeout(() => beep(780, 0.12, 0.2, 'square'), 110); },
  defuseTick() { beep(1600, 0.04, 0.12, 'square'); },
  explosion() { hiss(0.9, 350, 1.0); beep(55, 0.8, 0.7, 'sine', 28); },
  buy() { beep(660, 0.07, 0.2, 'square'); setTimeout(() => beep(990, 0.09, 0.2, 'square'), 80); },
  deny() { beep(220, 0.12, 0.2, 'square', 160); },
  win() { [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.16, 0.22, 'triangle'), i * 130)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.2, 'triangle'), i * 140)); },
  step() { hiss(0.05, 400, 0.06); },
  bounce() { beep(300, 0.05, 0.1, 'sine', 200); },
};
