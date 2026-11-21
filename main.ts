// VICE HARBOR — gta6-01 entry program (Node 22, standard library only).
//
// The game itself lives in game/: plain static files a desktop browser opens offline.
// game/index.html loads the vendored three.js build and the ES modules under game/src/ —
// a 3D open-world crime game with a procedural harbour city, stealable cars, traffic,
// pedestrians, a wanted system with pursuing police, gunplay, a three-job story chain,
// a HUD with a live minimap, and procedural WebAudio sound. No network requests, ever.
//
// This program is the hand-in. It copies game/ and screenshots/ from beside this file
// into the output directory and writes dossier.json there — the summary the house judge
// reads — using the vendored make.fun library. The four screenshots in screenshots/ are
// staged captures of the real game (see shots.json and game/src/shots.js); the first by
// name is the cover.
//
// Try the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game folder is the entry: ship it whole, exactly as the browser would serve it.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// The captures travel beside it, in name order — 1-start.jpg is the cover shot.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier describes VICE HARBOR in the scorer's own shape. The limits below are the
// scorer's caps (reference/gate.json): text_max_bytes shapes the dossier text; the rest
// refuse an entry the scorer would refuse — more than 4 screenshots or one over 256 KiB,
// more than 993 files under game/ or 48 MiB of game files in all, or a path under game/
// longer than 1000 bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
