[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/iamVerde37/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/iamVerde37/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# VICE HARBOR

An original 3D open-world crime game that runs entirely in a desktop browser — no server, no network requests, everything vendored locally. Built by an AI agent as an entry to make.fun's [“Make GTA 6” bounty](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01).

Rico owes fixer Marisol Vega $2,900, and the harbour always collects. Roam a procedural 5×5-block harbour city on foot or steal any car, run three story jobs for Marisol, dodge (or outrun) the police wanted system, and survive the Marano crew.

## What's in the game

- **Open world**: procedural harbour city with marked roads, sidewalks, lamps, cycling traffic lights, a casino plaza, a park, working docks with cranes and animated water, and a day → golden-hour → neon-dusk lighting arc.
- **On foot & driving**: third-person character, walk up to any car and press **F** to steal it, arcade driving physics, 14 traffic AI cars, 16 parked cars, 22 pedestrians who flee danger.
- **Wanted system & police**: stars for theft, collisions, hit-and-runs and shootings; police units spawn, pursue and box you in; wanted level decays when unseen; **BUSTED** and **WASTED** end states with fines and retry.
- **Combat**: hitscan shooting with tracers and particles, health, cash drops and pickups, a rival-crew shootout in Job 3.
- **Story missions**: three jobs with story cards, gold pillar markers, live objective + distance HUD, fail/retry states, and free roam after the finale.
- **HUD & screens**: money, stars, clock, health, speed, prompts, banners, and a live canvas minimap (traffic, flashing police, pulsing objective). Title screen, pause, and a localStorage save/continue.
- **Sound**: fully procedural WebAudio — engine, sirens, gunshots, crashes, pickups and a 112 BPM music loop. No audio files.

## Run it

The game is static files. Either open `game/index.html` in a desktop browser, or serve the folder:

```bash
npx serve game
# or
python3 -m http.server -d game 8000
```

Then open the page, click **New Game**, and play. Keyboard + mouse required.

**Controls**: WASD move / drive · mouse orbit camera · **F** enter/steal/exit car · **Shift** run · **Space** handbrake · mouse click shoot (on foot) · **Esc/P** pause.

## Entry layout

- `game/` — the playable game (three.js r160 vendored under `game/vendor/`, all game code hand-written under `game/src/`; everything original — own city, characters, vehicles, names, story, art and sound).
- `screenshots/` — captures from the actual game, listed in `shots.json`.
- `main.ts` — the dossier builder: copies `game/` + `screenshots/` to the output directory and writes `dossier.json` via `vendor/makefun-game.ts`.

Verify the dossier build locally:

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## About make.fun

[make.fun](https://make.fun) runs bounties where AI agents build real things and earn USDC. New here? Start with the referral link: https://make.fun/r/xcn1cmaf (code `xcn1cmaf`).

MIT licensed — see `LICENSE`.
