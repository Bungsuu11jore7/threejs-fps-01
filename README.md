# EMBERLINE — Halcyon Works

[![make.fun](https://make.fun/badge.svg)](https://make.fun/c/threejs-fps-01)
[![three.js](https://make.fun/badge-threejs.svg)](https://make.fun/c/threejs-fps-01)
[![FPS](https://make.fun/badge-fps.svg)](https://make.fun/c/threejs-fps-01)

A round-based tactical FPS in the Counter-Strike tradition, built from
scratch on three.js 0.187.0 for
[make.fun's best three.js tactical FPS bounty](https://make.fun/c/threejs-fps-01).
Its map, names, art and sounds are all original — nothing copied.

## The game

You are D. Marsh of the **Wardens**, holding a derelict solar refinery —
**Halcyon Works** — against the **Embers**. Two teams, short rounds, and a
charge to plant or defuse at site A (the Array) or site B (the Pump House).

- **Rounds**: a 15 s buy phase, then a 100 s round. First team to 5 rounds
  takes the works. Win by eliminating the enemy squad, by stopping the
  plant, or by defusing the charge before its 35 s fuse runs out.
- **Economy**: $800 to start; $300 a kill, $325 a round win, $150 a loss,
  $300 for a defuse. Spend it in the buy menu (B) on five weapons and a
  frag grenade.
- **Gunplay**: hitscan against real bodies — headshots pay double. Recoil
  climbs, spread blooms while moving and firing, so stopping to aim pays.
  Crouch, walk slow, jump; collision is real AABB geometry. A compass
  strip up top shows your heading and the bearing of both sites.
- **Bots**: four Embers run waypoint routes to a site, plant the charge,
  then guard it; two Warden teammates hold angles and rotate toward
  gunfire they hear. They see, react, burst-fire and strafe.
- **Arsenal**: P9 Sparrow sidearm, AR-77 Longspur rifle, VK-9 Hornet SMG,
  SG-12 Bramble shotgun, LW-50 Falcon marksman rifle (right-click scope),
  Spark frag grenade.

## Play

Serve `game/` with any static server and open `index.html` in desktop
Chrome (WebGL 2). Click **Deploy** to lock the pointer and play.
`WASD` move, mouse look, click fire, `R` reload, `Ctrl` crouch,
`Shift` walk slow, `Space` jump, `1–5` weapons, `G` grenade, `B` buy,
hold `E` to defuse.

## Layout

- `game/index.html` — page, HUD, compass, import map for `three`
- `game/src/main.js` — bootstrap, fixed-step (60 Hz) loop, camera, viewmodel, dust
- `game/src/state.js` — central state, weapon table, economy constants
- `game/src/world.js` — Halcyon Works: colliders, waypoint graph, ray tests
- `game/src/player.js` — movement, collision, weapon input
- `game/src/weapons.js` — hitscan, recoil/spread, grenades, tracers
- `game/src/bots.js` — bot AI (routes, holds, engages, plants) + rigs
- `game/src/rounds.js` — round lifecycle, bomb, economy, match end
- `game/src/hud.js` — HUD, compass, buy menu, banners, killfeed
- `game/src/audio.js` — synthesized WebAudio effects, no audio assets
- `game/src/palette.js` — dusk-refinery palette, canvas-made textures
- `game/src/shots.js` — deterministic setups for the dossier screenshots
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with
`vendor/makefun-threejs.ts`. Run it with `MAKEFUN_OUTPUT_DIR` set to a
local folder to produce the handoff outside the grader.

Screenshots are real renders of this game's own code in headless Chrome,
taken with `?shot=cover|buy|plant|end` — deterministic setups, one frame
each, never edited.

## License

MIT — see `LICENSE`.

---
Built by an AI agent for make.fun — try it yourself with referral code `6wtj6288`.
