# Sketchquest: Status

Snapshot of what is implemented so far. This is a scaffold: the plumbing works. There is no Gemini logic yet, but the core gameplay loop (death, respawn, coins, win, patrolling enemies) is in.

## Quick start

```bash
cp .env.example .env    # GEMINI_API_KEY is not used yet
npm install
npm run dev             # client :5173 + server :3001
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs client (Vite) and server (tsx watch) together via `concurrently` |
| `npm run build` | Typechecks and builds the client to `client/dist` |
| `npm start` | Production: Express serves `/api` and the built client (one service, for Railway) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |

Requires Node >= 20.11. In dev, Vite proxies `/api` to `http://localhost:3001`. In production, `PORT` is read from the environment (default 3001) and unknown non-`/api` GET routes fall back to `index.html`.

## Who owns what

| Area | Path | Owner |
| --- | --- | --- |
| Phaser game code | `client/src/game` | Game dev |
| React screens | `client/src/ui` | UI dev (currently a placeholder `App.tsx` that mounts the game full screen) |
| Express API | `server` | Backend |
| Shared types/constants | `shared` | Everyone (keep changes small and announce them) |

## Repo layout

```
package.json        npm workspaces: client, server, shared
.env.example        GEMINI_API_KEY=
client/             Vite + React + TypeScript + Phaser 3 (arcade physics)
  src/main.tsx
  src/ui/App.tsx
  src/game/{index,mountGame,GameScene}.ts
server/index.ts     Express + Zod + dotenv (+ @google/genai installed, unused)
shared/             imported as "@sketchquest/shared" (TS source, no build step)
samples/            empty (.gitkeep), for sample sketches
```

## Shared (`@sketchquest/shared`)

- **`constants.ts`**: `WORLD_W=1600`, `WORLD_H=900`, `GRAVITY=1200`, `JUMP_VELOCITY=560`, `RUN_SPEED=240`, `PLAYER_W=32`, `PLAYER_H=48`.
- **`level.ts`**:
  - `LevelSchema` (Zod) and the inferred `Level`, `Platform`, `Hazard`, `Coin`, `Enemy` types.
  - Coordinates are normalized 0-1000, origin top-left.
  - `sampleLevel` is a small playable level with platforms, a spike, lava, coins, an enemy and a goal.
  - `DeathCause = "spike" | "lava" | "enemy" | "fall"`.
  - `DeathEvent = { cause, x, y, attempt, deathsAtSpot, coins, timeAlive }`.
  - `WinEvent = { coins, timeAlive }` (added — see below).
- **`events.ts`**: `gameEvents`, a tiny typed emitter with `"death"` (`DeathEvent`) and `"win"` (`WinEvent`, changed from no payload — see below). `on()` returns an unsubscribe function. The UI/narrator subscribes here and never touches Phaser internals.
- **`api.ts`**: response types `HealthResponse`, `LevelResponse` (`{ level }`), `RoastResponse` (`{ roast }`).

Level coordinate conventions (as the game currently interprets them):

- Platforms, hazards and the goal: `x, y` is the top-left corner, `w, h` is the size.
- Start, coins and enemies: `x, y` is the center.
- `patrol` is a normalized 0-1000 distance, scaled the same way as world width and used as the enemy's total patrol range.

**Shared change made while building the gameplay loop:** `win` previously fired with no payload. The win overlay needs to show the time and coin count, so `events.ts`'s `GameEventMap["win"]` is now `WinEvent` (added to `level.ts`) instead of `void`, and `GameScene` passes `{ coins, timeAlive }` when it emits `"win"`. `DeathEvent` itself was already complete and needed no changes.

## Server

`server/index.ts`:

| Route | Status |
| --- | --- |
| `GET /api/health` | Returns `{ ok: true }` |
| `POST /api/level` | Stub. Ignores the body and returns `{ level: sampleLevel }` |
| `POST /api/roast` | Stub. Ignores the body and returns `{ roast: "You died to a doodle. A DOODLE." }` |

- JSON body limit is 20 MB, so base64 sketch images will fit.
- `.env` is loaded from the repo root.
- `@google/genai` is installed but not imported anywhere.
- In production the server runs through `tsx` (no compile step), because `shared` is TypeScript source.

## Client game (`client/src/game`)

- **`mountGame(el)`** creates the Phaser game (1600x900, scale FIT, centered, arcade physics with shared `GRAVITY`) and returns a `GameHandle { game, loadLevel, destroy }`.
- **`loadLevel(level)`** (also `handle.loadLevel`) validates with `LevelSchema`, then restarts the scene with the new level. No page refresh is needed. If called before Phaser has finished booting, it waits for boot. This is also what resets attempt/coin/death tracking, since it's a new level.
- **`GameScene`** loads `sampleLevel` by default and orchestrates everything below; game logic itself lives in the smaller files it composes:
  - **`Player.ts`**: the player rectangle + arcade body. `handleInput` reads arrow/WASD + jump using `RUN_SPEED`/`JUMP_VELOCITY` from `shared/constants.ts`; `bounce()` for the enemy-stomp pop, `teleport()` for respawn, `setActive()` to hide/disable during the death effect.
  - **`Enemy.ts`**: a dynamic arcade body affected by gravity. Patrols `patrol` world px (scaled 0-1000 -> px like other level distances) centered on its spawn point, reversing at the range ends or when `overlapRect` finds no platform ahead of its leading edge (walking off an edge).
  - **`AttemptState.ts`**: tracks `attempt` (starts 1, `nextAttempt()` on a death), `coins` (this attempt), and death positions for `deathsAtSpot` (deaths within 100 world px of each other, including the current one) and `timeAlive` (seconds since the attempt started, 1 decimal).
  - **`deathEffects.ts`** / **`particles.ts`**: screen shake + red flash + a particle burst on death; `particles.ts`'s `burstParticles()` is reused for the (smaller, coin-colored) coin-collect burst.
  - **`Hud.ts`**: the top-left "Coins: N" counter, fixed to the camera.
  - **`WinOverlay.ts`**: the "LEVEL CLEAR" / time / coins / "press R to replay" overlay shown on reaching the goal.
- Gameplay loop implemented in `GameScene`:
  - **Death**: overlap with a spike/lava hazard, touching an enemy from the side/below, or falling past `WORLD_H + 100`px all fire exactly one `"death"` event via `gameEvents` (guarded by a `dead` flag), then play the death effect and respawn at the level start ~600ms later with coins reset. Landing on top of an enemy (falling, feet above its midpoint) kills the enemy and bounces the player instead of killing them.
  - **Coins**: collide via overlap, disappear, trigger a particle burst, and increment the HUD counter. They reappear (and the counter resets) on respawn or replay.
  - **Win**: overlap with the goal fires `"win"` with `{ coins, timeAlive }`, shows `WinOverlay`, and locks movement (via the same `locked` flag death uses).
  - **R** replays the level: resets to the start with coins/time cleared and the win overlay (if any) dismissed, without counting as a death or incrementing `attempt`.
- Fields on `GameScene`: `player` (`Player`), `platforms` (static group), `hazards`, `coins` (rectangle lists, each with its level `id` in `getData("id")`), `enemies` (`Enemy[]`), `goal`.

## UI (`client/src/ui`)

`App.tsx` is a placeholder. It mounts the game in a full-viewport div and destroys it on unmount. Replace it with real screens, and keep calling `mountGame` and `loadLevel` from `../game`.

## Verified

- `npm run typecheck` and `npm run build` pass.
- Dev (prior scaffold pass): the game renders, the player runs and jumps and lands on platforms, and `loadLevel(customLevel)` rebuilds the scene with no refresh and a single canvas.
- The `/api` proxy from Vite to Express works.
- Production (`npm run build && npm start`): serves the client at `/`, falls back to `index.html` for unknown routes, and still returns JSON for `/api`.
- The gameplay loop above (death/respawn/coins/win/enemy patrol) has only been verified with `npm run typecheck` and `npm run build` so far, not by driving it in a browser yet — see "How to test" below for what to click through next.

## Not done yet

- Game feel: coyote time, jump buffering, variable jump height (release-early = shorter jump), squash-and-stretch on jump/land.
- Debug tools behind `?debug=1` (hitboxes, attempt/deathsAtSpot/timeAlive overlay, `testLevels.ts` with 1/2/3 level switching, including a deliberately messy level to prove `loadLevel` doesn't crash on bad entities).
- Real `/api/level` (sketch to Gemini to `Level`, validated with `LevelSchema`) and `/api/roast`.
- Sketch upload and other UI screens.
- Sample sketches in `samples/`.
- Tests.
- Manual/browser verification of this pass (see above).

## How to test

```bash
npm install
npm run dev             # client :5173 + server :3001
```

Open the client URL and drive `sampleLevel` (the default level `GameScene` loads):

- **Spike**: run into the spike near the start (`spike-1`) and confirm exactly one `"death"` event with `cause: "spike"` (log `gameEvents.on("death", console.log)` from a console or temporary subscriber), then respawn at the start with the death effect (shake/flash/particles) and coins reset.
- **Lava**: fall/walk into the lava patch (`lava-1`) for `cause: "lava"`.
- **Enemy (death)**: walk into `enemy-1` from the side for `cause: "enemy"`.
- **Enemy (stomp)**: jump onto `enemy-1` from above — it should die and bounce the player instead of firing a death.
- **Fall**: walk/jump off the level to the right or left until `player.y` passes `WORLD_H + 100` for `cause: "fall"`.
- **deathsAtSpot**: die twice near the same spot (within 100 world px) and confirm the second death's `deathsAtSpot` is `2`.
- **Coins**: collect a coin, confirm the top-left HUD counter increments and a particle burst plays; die or press `R` and confirm coins reset and the coin reappears.
- **Enemy patrol**: watch `enemy-1` walk back and forth without falling off `ground-2` or wandering past its patrol range.
- **Win**: reach the goal rectangle (`goal`), confirm a single `"win"` event with `{ coins, timeAlive }`, the "LEVEL CLEAR" overlay, and that movement is locked.
- **Replay**: press `R` (both mid-attempt and after winning) and confirm it returns to the start with coins/time reset, the win overlay (if shown) is dismissed, and it does **not** increment `attempt` or fire a death.

## Known quirks

- In dev you will see harmless `Cannot suspend/resume a closed AudioContext` console errors. They come from React StrictMode mounting and destroying the game once.
- The client bundle is about 1.5 MB because of Phaser, so Vite prints a chunk-size warning.
