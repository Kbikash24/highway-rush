# HIGHWAY RUSH

Browser-based 3D motorcycle combat racing — an original arcade game inspired by classic highway brawler racers.
Built with React, Vite, TypeScript, Three.js / React Three Fiber and a deterministic shared simulation that the
upcoming Colyseus server will run authoritatively.

> **Current build: Phase 1–3 prototype.** One complete, playable map (Coastal Highway) in a solo race against
> 3 AI rivals with traffic, nitro, collisions, health, wrecks, **melee combat (punch, kick, bat, chain, block)**
> and a full race HUD. Online multiplayer, garage/progression and the other maps are **not implemented yet** —
> see [Roadmap & status](#roadmap--status).

## Quick start

Requirements: Node.js 20+ (tested on Node 24) and npm 10+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts (run from the repo root):

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Vite dev server for the client                           |
| `npm run build`     | Type-check + production build → `apps/client/dist`       |
| `npm run preview`   | Serve the production build locally                       |
| `npm run typecheck` | Type-check `shared` and `client`                         |
| `npm test`          | Vitest suite for the shared simulation                   |

## Controls

| Desktop          | Action                   |
| ---------------- | ------------------------ |
| W / ↑            | Accelerate               |
| S / ↓            | Brake                    |
| A D / ← →        | Steer                    |
| Shift            | Nitro                    |
| E                | Wheelie (stunt points + nitro refill) |
| J                | Punch                    |
| Space            | Kick                     |
| K                | Weapon swing (bat / chain — grab a crate first) |
| L (hold)         | Block                    |
| Esc / P          | Pause                    |

Mobile / touch: on-screen steer, gas, brake, nitro, stunt, punch, kick, weapon and block buttons appear
automatically on touch devices (force on/off in **Settings → Touch controls**). Landscape orientation recommended.

## Gameplay (what works today)

- **Coastal Highway** — 5 km point-to-point race along sunset sea cliffs: curves, hills, guard rails, street lamps,
  palms, rocks, cypress trees, billboards, distant mountains and islands, animated sea, start/finish gates.
- **Bike handling** — arcade road-space physics: throttle curve to top speed, braking, speed-sensitive steering,
  lean, centrifugal drift on curves (you must steer into bends), slope gravity, off-road slowdown on shoulders.
- **3 bike classes** with distinct stats: *Viper 600* (balanced), *Thunderhog 1200* (durable, big nitro), *Blade R1K* (fast, fragile).
- **Traffic** — pooled cars, sports cars, vans, buses and trucks in 4 lanes (2 oncoming). Vehicles follow
  leaders, brake, and change lanes to overtake. Density setting: Light / Normal / Rush hour.
- **Collisions & health** — rear-end, head-on and side-swipe impacts scaled by closing speed, vehicle mass and
  bike durability; guard-rail scrapes and impacts; bike-to-bike bumping. Health 0 → **wreck** (tumble, 3 s respawn
  with temporary invulnerability).
- **Nitro** — meter, boost to 128 % top speed, camera FOV kick, flame + speed-line effects. Refills slowly, faster
  while wheelieing, and +8 per near miss.
- **Style scoring** — near-miss bonuses with a ×8 combo multiplier, timed wheelie stunts.
- **Combat** — ride alongside a rival and attack the side they're on (picked automatically):

  | Attack | Damage | Reach (lateral) | Cooldown | Effect |
  | ------ | ------ | --------------- | -------- | ------ |
  | Punch  | 7      | 1.8 m           | 0.55 s   | light knockback, short stagger |
  | Kick   | 11     | 2.2 m           | 1.0 s    | big shove — kick rivals into traffic or the rail |
  | Bat    | 18     | 2.5 m           | 1.1 s    | heavy stagger, 6 hits before it breaks |
  | Chain  | 13     | 3.0 m           | 0.9 s    | longest reach, 8 hits |

  Every attack has a short wind-up (telegraph) before the hit is checked. **Blocking** (hold L) cuts damage to
  30 %, mostly cancels knockback and makes the attacker recoil, but caps your throttle. Clean hits stagger the
  target (wobbly steering, reduced throttle, no nitro) and interrupt their wind-up. Weapon crates sit on the
  road and respawn; you drop your weapon when you wreck. A wreck within 3 s of being hit counts as a
  **knockout** for the attacker (+600 pts). AI rivals have individual aggression, chase weapon crates, attack
  when in reach and sometimes block telegraphed swings. Combat has its own sounds, hit sparks, pose
  animations, a target-in-reach marker and a cooldown action bar in the HUD.
- **AI rivals** — lane-choosing riders that avoid traffic by time-to-contact, use nitro on straights, with light rubber-banding.
- **HUD** — position, race timer, distance, race progress strip, heading-up radar mini-map (traffic + rivals),
  opponent list with health and gaps, speedometer with gear/RPM and nitro ring, health/nitro bars, combo/score,
  notifications, countdown, damage flash, wreck/respawn overlay.
- **Menus** — animated logo main menu with 3D bike showcase, bike select with stat bars and rider name,
  pause menu, settings (quality, traffic, volumes, radar, touch), results screen with standings and rewards.
- **Audio** — fully procedural WebAudio: engine (RPM/gear-driven), wind, nitro, scrape, crash, wreck, near-miss
  whoosh, countdown, stunt, victory/defeat jingles and a procedural driving beat. Volume sliders in settings.
- **Performance** — fixed 60 Hz simulation with render interpolation; instanced traffic (≈10 draw calls for all
  vehicles) and props; pooled particles; quality presets (DPR, shadows, bloom, fog distance, prop density);
  GPU resources disposed on unmount; auto-pause when the tab is hidden.

## Architecture

```
highway-rush/
  apps/
    client/                 React + Vite + R3F renderer (independently deployable static site)
      src/
        components/         HUD, pause/settings/results overlays, touch controls
        game/
          audio/            Procedural WebAudio engine
          bikes/            Bike + rider model (GLB-swappable rig), sim binding, combat pose animation
          camera/           Road-space chase camera
          combat/           Weapon pickup crates
          effects/          Speed lines, sparks/debris particles, post FX, procedural textures
          input/            Keyboard + touch input manager
          scenes/           Race canvas, Coastal Highway builder, menu showcase
          session/          GameSession: fixed-step driver, event → audio/HUD/FX dispatch
          traffic/          Instanced traffic renderer + vehicle geometry
        pages/              Main menu, bike select, race
        store/              Zustand stores (game flow, HUD, persisted settings)
  packages/
    shared/                 Renderer-free, deterministic game logic (used by client now, server in Phase 4)
      src/
        constants/          Road/physics tuning, bikes, maps, attacks & weapons
        schemas/            Input/name sanitisation
        simulation/         Track, bike physics, combat, traffic AI, rival AI, RaceSimulation (+ tests)
        types/
```

**Why a custom arcade simulation instead of Rapier (for now):** all gameplay runs in road space
(distance `s`, lateral offset `d`) in pure TypeScript with a seeded RNG. It's deterministic, cheap enough to
run 4 players + traffic at a fixed server tick, and identical on client and server — which is exactly what
server-authoritative multiplayer with client prediction needs. Rapier remains an option for future features
that need rigid-body dynamics (ragdolls, debris); it isn't a dependency today.

**Fair-play groundwork:** inputs are sanitised and clamped (`sanitizeInput`) and only express *intent*
(throttle, steer, "punch pressed"…). The simulation alone decides speed, damage, health, nitro, attack range,
cooldowns, weapon possession, knockback and finishing (`simulation/combat.ts` → `findTarget` is the single
hit-validation path), and player names are sanitised (`sanitizePlayerName`). Today that simulation runs in
the browser for solo races; in Phase 4 the same code runs on the Colyseus server and clients only send inputs,
so a modified client cannot grant itself damage or health.

## Configuration

Copy `apps/client/.env.example` to `apps/client/.env.local`. The current solo build needs **no** variables; the
listed ones are reserved for multiplayer (Phase 4) and Supabase (Phase 5). Only `VITE_*` values reach the
browser — never put the Supabase service-role key in client env files.

## Deploying the client (free tier)

The client is a static site (`apps/client/dist`).

- **Vercel / Netlify / Cloudflare Pages**: build command `npm run build`, output directory `apps/client/dist`,
  install command `npm install` (run at the repo root so the workspace package resolves). Node 20+.
- **GitHub Pages**: run `npm run build` and publish `apps/client/dist` (set Vite `base` if serving from a sub-path).

The Colyseus server (Phase 4) will be a separate Node service deployable to a free tier such as Render or
Fly.io, keeping frontend and backend independently deployable.

## Roadmap & status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Architecture, menu, 3D highway, motorcycle, chase camera, steering/accel/brake | ✅ Done |
| 2 | Collisions, traffic AI, health, nitro (custom arcade physics — see above) | ✅ Done |
| 3 | Combat: punch/kick/weapons, block, knockback, stagger, pickups, AI combat | ✅ Done — validated by the shared simulation; it becomes server-side once Phase 4 adds the server |
| 4 | Colyseus server, 4-player rooms, matchmaking, private rooms, sync, results | ⏳ Not started — menu entries are visibly locked; there is **no** fake multiplayer |
| 5 | Garage, upgrades, progression (Supabase), other 3 maps, campaign, police | ⏳ Not started — results show coins/XP but nothing is persisted yet |
| 6 | Polish: recorded audio/music via Howler, more VFX, mobile tuning, deployment | 🟡 Partial — procedural audio, touch controls, quality presets done |

Known limitations of this prototype:

- Bikes, riders and vehicles are procedural placeholder models (the bike rig is designed for GLB replacement).
- Planned Phase 2 extras not built yet: ramps/jumps with airborne physics, suspension/road bumps, static road
  obstacles, traffic reacting to hits, Rapier-driven crash ragdolls and debris.
- Police/heat, Survival/Time Trial/Battle modes are not implemented.
- Desert Run, Neon City and Mountain Pass appear in the menu as "coming soon".

## Development notes

- In dev builds the active race session is exposed as `window.__HR_SESSION__` for debugging and automated
  browser tests (e.g. teleporting the player). It is not included in production builds.
# highway-rush
