// EMBERLINE — threejs-fps-01 entrypoint (Node 22, standard library only).
// Hands the game in: copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json with the kit's vendored library.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
// The program is deterministic: same repository in, same bytes out.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SHOT_LIMIT = 4;
const SHOT_CAP = 262144;

function die(message) {
  throw new Error(`main.ts: ${message}`);
}

const gamePath = join(root, 'game');
if (!existsSync(join(gamePath, 'index.html'))) die('game/index.html is missing');
const shotPath = join(root, 'screenshots');
const frames = existsSync(shotPath) ? readdirSync(shotPath).filter((n) => !n.startsWith('.')) : [];
if (frames.length < 3 || frames.length > SHOT_LIMIT) die(`screenshots/ must hold 3 or 4 images, found ${frames.length}`);
for (const name of frames) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name.startsWith('.') || name.startsWith('-')) die(`bad screenshot name: ${name}`);
  const size = statSync(join(shotPath, name)).size;
  if (size > SHOT_CAP) die(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
}

mkdirSync(dest, { recursive: true });
cpSync(gamePath, join(dest, 'game'), { recursive: true });
mkdirSync(join(dest, 'screenshots'), { recursive: true });
cpSync(shotPath, join(dest, 'screenshots'), { recursive: true });

// The gate's own caps (reference/gate.json): the dossier text cap shapes the
// bytes; the others refuse an entry the scorer would refuse.
writeFileSync(
  join(dest, 'dossier.json'),
  buildDossier(dest, {
    text_max_bytes: 163840,
    screenshots: { max: SHOT_LIMIT, max_bytes: SHOT_CAP },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
console.log(`EMBERLINE handed in: ${frames.length} screenshots, dossier written to ${join(dest, 'dossier.json')}`);
