# Sketchquest: Status

Snapshot of what is implemented so far. The gameplay loop (death, respawn, coins, win, patrolling enemies) is in, and the server has the real `/api/level` and `/api/roast` pipelines. Both are written but have not been run against real Gemini yet (no key or sample photos so far); without a key they serve fallback levels and canned roasts.

## Quick start

```bash
cp .env.example .env    # add GEMINI_API_KEY (optional: GEMINI_MODEL, GEMINI_ROAST_MODEL)
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
server/             Express + Zod + dotenv + @google/genai (see Server)
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
- **`api.ts`**: `HealthResponse`; `LevelRequestSchema`/`LevelRequest` (`{ image }`, base64 JPEG, a `data:` prefix is tolerated); `LevelResponse` (`{ level, meta: { repairs, fallback } }`); `RoastRequestSchema`/`RoastRequest` (`{ levelName, cause, attempt, deathsAtSpot, coins, timeAlive, recentRoasts? }`); `RoastResponse` (`{ line }`, was `{ roast }`).
- **`sanitizeLevel.ts`**: moved here from `client/src/game` so the server runs the same code on Gemini output. Clamps/drops bad entities, fixes invalid hazard types, and renames duplicate ids (`p1` -> `p1-2`) instead of dropping the entity.
- **`validate.ts`**: `validateLevel(level) -> { reachable, report }`. BFS over platform tops using the constants at 90% (`SAFETY`) of the physical limit (`MAX_JUMP_HEIGHT` ~118px, `MAX_FLAT_GAP` ~202px). Report lines are plain English (`gap of 512px between p1 and p2 exceeds max flat gap 202px`) and the report is empty when reachable. Platforms with no hazard-free stretch as wide as the player are unusable. Enemies and coins are ignored. `DeathCauseSchema` (Zod) was added to `level.ts`; `DeathCause` is inferred from it.

Level coordinate conventions (as the game currently interprets them):

- Platforms, hazards and the goal: `x, y` is the top-left corner, `w, h` is the size.
- Start, coins and enemies: `x, y` is the center.
- `patrol` is a normalized 0-1000 distance, scaled the same way as world width and used as the enemy's total patrol range.

**Shared change made while building the gameplay loop:** `win` previously fired with no payload. The win overlay needs to show the time and coin count, so `events.ts`'s `GameEventMap["win"]` is now `WinEvent` (added to `level.ts`) instead of `void`, and `GameScene` passes `{ coins, timeAlive }` when it emits `"win"`. `DeathEvent` itself was already complete and needed no changes.

## Server

| Route | Status |
| --- | --- |
| `GET /api/health` | Returns `{ ok: true }` |
| `POST /api/level` | Real. Body `{ image }` -> `{ level, meta }`. 400 for a missing, oversized (> 12M base64 chars), non-base64 or non-JPEG/PNG/WebP image. Never 500s for Gemini failures: any error, timeout or unbeatable result returns a hand-made level with `meta.fallback: true` |
| `POST /api/roast` | Real. Body `RoastRequest` -> `{ line }`. 400 only for a malformed body. Model timeout is 1200ms; on timeout/error/junk output it returns a canned line for the cause, still with status 200 |

Files in `server/`:

- `env.ts`: loads the repo-root `.env` (side-effect import, first in `index.ts` and the scripts).
- `gemini.ts`: `@google/genai` Interactions API wrapper (`generate()`, `withTimeout()`, `GEMINI_MODEL` default `gemini-3.8-flash`). The SDK's `generation_config` type has no `temperature`, so it is sent via `extra_body`. Against gemini-3.8-flash it is accepted (no 400), but whether the value is honored is unverified. Guard: a 400 that succeeds when retried without temperature disables it for the process and logs once. Thinking level must be `low`/`medium`/`high` (`minimal` is rejected with a 400); it comes from `GEMINI_ROAST_THINKING` / `GEMINI_LEVEL_THINKING` (default `low`, invalid values fall back to `low` with a warning). `max_output_tokens` includes thinking tokens: 80 left the roast with no text (`status: incomplete`), so the roast uses 512.
- `prompts.ts`, `levelFromSketch.ts`: one structured-output call (photo + system prompt, schema from `z.toJSONSchema(LevelSchema)`), then sanitize -> `validateLevel`. If unreachable it sends the photo, the level JSON and the validator report back for minimal edits (max 2 rounds). Per-call timeouts are ~6s first / ~4s repair and repairs are skipped once the ~8s budget is spent. Stage timings are logged.
- `fallbackLevels.ts`: three hand-made levels (all checked by `test-validate.ts`), picked by image hash.
- Cache: in-memory, sha256 of the image, max 200 entries, plus in-flight dedupe of identical concurrent scans. Fallbacks are not cached, so a retry gets another shot at Gemini.
- `roast.ts`: prompt (PG-13, one sentence, 20 word cap, escalates with `deathsAtSpot`, never repeats `recentRoasts`), output cleanup (first sentence, quotes stripped, truncated to 20 words) and the per-cause fallback pool. The client sends `recentRoasts` (last 3); the server keeps no roast state.
- `sketchImage.ts`: image body parsing (raw base64 or data URL).
- `index.ts`: JSON body limit 20 MB, one-line request log for `/api`, JSON 404 for unknown `/api` routes, and a global JSON error handler.
- `.env` is loaded from the repo root. In production the server runs through `tsx` (no compile step), because `shared` is TypeScript source.

Scripts (from the repo root, `-w server`): `test:validate` (validator, sanitizer, fallback levels), `test:pipeline` (repair loop, fallback and cache with a scripted fake model, no network), `test:roast` (offline format checks, then 5 death contexts against the model when a key is set), `run-samples` (runs every image in `samples/` through the full pipeline and prints level name, entity counts, reachable, repairs, fallback, ms).

## Client game (`client/src/game`)

- **`mountGame(el)`** creates the Phaser game (1600x900, scale FIT, centered, arcade physics with shared `GRAVITY`, and Arcade's built-in hitbox debug renderer enabled iff `?debug=1`) and returns a `GameHandle { game, loadLevel, destroy }`.
- **`loadLevel(level)`** (also `handle.loadLevel`) takes `unknown` (not `Level`) since it has to accept untrusted data (raw Gemini output). It runs the input through `sanitizeLevel()` before `LevelSchema.parse`, then restarts the scene with the result. No page refresh is needed. If called before Phaser has finished booting, it waits for boot. This is also what resets attempt/coin/death tracking, since it's a new level.
- **`prepareLevel.ts`**: the one entry point for untrusted levels: `sanitizeLevel` -> `fixLevel` -> `LevelSchema.parse`. `loadLevel` and the debug hotkeys both go through it.
- **`fixLevel.ts`**: spawn safety, runs after `sanitizeLevel`. Works in normalized coords using the shared `PLAYER_W`/`PLAYER_H` (converted via `units.ts`) and `COIN_SIZE` (the coin sprite edge, 20px). (1) If a level has no platforms, adds an `auto-ground` platform spanning the bottom. (2) If the player's box at `start` overlaps a platform or hazard, or no platform is beneath it, `start` snaps to the top-center of the nearest platform (`y = platform.y - half player height`), preferring a platform where the player wouldn't stand inside another platform/hazard. (3) A goal or coin fully inside a platform is nudged to just above that platform's top edge (repeated a few times for stacked platforms). Goals/coins only partly overlapping a platform are left alone.
- **`units.ts`**: `sx`/`sy` (normalized -> world px), `nx`/`ny` (the inverse) and `COIN_SIZE`, shared by `GameScene` and `fixLevel`.
- **`sanitizeLevel`** (now `shared/sanitizeLevel.ts`, imported from `@sketchquest/shared`): coerces arbitrary/malformed level data into something `LevelSchema` accepts instead of letting it throw — numeric fields are clamped into `[0, 1000]`, `w`/`h` fall back to `1` instead of `0`, invalid hazard `type`s fall back to `"spike"`, and any platform/hazard/coin/enemy missing a string `id` is dropped rather than crashing the whole level. Missing `start`/`goal` fall back to `sampleLevel`'s.
- **`debug.ts`**: exports `DEBUG`, true iff the page URL has `?debug=1`.
- **`testLevels.ts`**: three levels for the debug hotkeys — `easyLevel` (1), `spikeGauntletLevel` (2), and `messyLevel` (3, typed `unknown` on purpose: overlapping/duplicate platforms, out-of-range and negative coordinates, an invalid hazard type, entities missing `id`/`patrol`, and zero coins), exported together as `debugTestLevels`.
- **`GameScene`** loads `sampleLevel` by default and orchestrates everything below; game logic itself lives in the smaller files it composes:
  - **`Player.ts`**: the player rectangle + arcade body. `handleInput` takes a `MoveInput` (`{ left, right, jump }` held-state, built by `GameScene.readInput()` from arrow/WASD/space **or** the touch buttons) using `RUN_SPEED`/`JUMP_VELOCITY` from `shared/constants.ts`, plus the game-feel layer: ~100ms coyote time (jump still works briefly after leaving a platform), ~100ms jump buffering (a jump pressed briefly before landing fires on landing), variable jump height (releasing jump early clamps the ascent to half a full jump), and squash-and-stretch tweens on jump and on landing. `bounce()` for the enemy-stomp pop, `teleport()` for respawn, `setActive()` to hide/disable during the death effect.
  - **`Enemy.ts`**: a dynamic arcade body affected by gravity. Patrols `patrol` world px (scaled 0-1000 -> px like other level distances) centered on its spawn point, reversing at the range ends or when `overlapRect` finds no platform ahead of its leading edge (walking off an edge).
  - **`AttemptState.ts`**: tracks `attempt` (starts 1, `nextAttempt()` on a death), `coins` (this attempt), and death positions for `deathsAtSpot` (deaths within 100 world px of each other, including the current one, also kept as `lastDeathsAtSpot` for the debug overlay) and `timeAlive` (seconds since the attempt started, 1 decimal).
  - **`deathEffects.ts`** / **`particles.ts`** / **`floatingText.ts`**: `playDeathEffect(scene, x, y, cause)` does the screen shake + red flash + player-colored burst for every death, plus per cause: `spike` = red shards + "SPIKED"; `lava` = upward orange/yellow burst + "TOASTED"; `enemy` = "SQUISHED"; `fall` = three downward streaks + "GRAVITY WINS". Effects are pinned to the visible canvas (falls die below it). `floatText()` pops a word in, rises 100px and fades over 700ms in the `HAND_FONT` stack from `fonts.ts` (Comic Sans MS / Marker Felt / cursive). `burstParticles()` (now with an optional `arc`) is also used for the coin-collect burst.
  - **`LevelIntro.ts`**: the level-start title card. On every new level load (`loadLevel`, the debug hotkeys, and the initial scene) it fades in the level name (~0.5s) with input and the physics world frozen for 1.5s, then unlocks and shows "GO!" for 0.4s. Not shown on `R` restarts or death respawns, and `R` is ignored while the card is up. The attempt timer restarts when input unlocks. No new shared event.
  - **`audio.ts`**: Web Audio blips, no asset files: `playJump`/`playCoin`/`playDeath`/`playWin`/`playStomp`, master volume 0.12. The `AudioContext` is created lazily on the first keydown/pointer/touch (`installAudioUnlock()` in `mountGame`; the listeners stay until the context is actually running, which iOS needs). **M** toggles mute (state survives level loads; the HUD shows "Muted (M)").
  - **`TouchControls.ts`** / **`RotateBanner.ts`** / **`touchLock.ts`**: see "Touch controls" below.
  - **`Hud.ts`**: the top-left "Coins: N" counter, fixed to the camera.
  - **`WinOverlay.ts`**: the "LEVEL CLEAR" / time / coins / "press R or tap to replay" overlay shown on reaching the goal. Tapping/clicking anywhere replays too (armed 500ms after the overlay appears so jump-mashing at the goal can't skip it).
  - **`DebugOverlay.ts`**: `?debug=1`-only text (top-right) showing `attempt`/`deathsAtSpot`/`timeAlive` each frame and a `[1/2/3] test levels` hint.
- Gameplay loop implemented in `GameScene`:
  - **Death**: overlap with a spike/lava hazard, touching an enemy from the side/below, or falling past `WORLD_H + 100`px all fire exactly one `"death"` event via `gameEvents` (guarded by a `dead` flag), then play the death effect and respawn at the level start ~600ms later with coins reset. Landing on top of an enemy (falling, feet above its midpoint) kills the enemy and bounces the player instead of killing them.
  - **Coins**: collide via overlap, disappear, trigger a particle burst, and increment the HUD counter. They reappear (and the counter resets) on respawn or replay.
  - **Win**: overlap with the goal fires `"win"` with `{ coins, timeAlive }`, shows `WinOverlay`, and locks movement (via the same `locked` flag death uses).
  - **R** replays the level: resets to the start with coins/time cleared and the win overlay (if any) dismissed, without counting as a death or incrementing `attempt`.
  - **Debug only (`?debug=1`)**: hitboxes are drawn (Arcade's own debug renderer), the debug text overlay is shown, and pressing `1`/`2`/`3` loads `easyLevel`/`spikeGauntletLevel`/`messyLevel` via `this.scene.restart()` (through the same sanitize -> `LevelSchema.parse` pipeline as `loadLevel`).
- **Touch controls** (`TouchControls.ts`): shown when Phaser detects a touch device (`sys.game.device.input.touch`) or the URL has `?touch=1`. Left/right buttons bottom-left and a jump button bottom-right, 120 world px each, semi-transparent rounded squares with arrow glyphs, pinned to the camera (`setScrollFactor(0)`). Every frame it polls all pointers against the button rects (so multi-touch works and a thumb can slide between buttons) and the result is OR'd with the keyboard into the same `MoveInput`, so coyote time, jump buffering and variable jump height (release jump = short hop) work identically. It tops up touch pointers to 3 (the same effect as `input.addPointer(2)`, but without stacking extra pointers on every scene restart). `touchLock.ts` sets `touch-action: none` and no-select/no-callout styles on the canvas and `preventDefault`s touch events and `contextmenu` on it (`mountGame` applies it once Phaser has booted).
- **Phone scaling**: the scale mode is `FIT` (1600x900 letterboxed and centered, never cropped) in both orientations; Phaser re-measures the parent on `resize`/`orientationchange` and every 500ms. `RotateBanner.ts` draws a small "Rotate your phone" pill at the top of the scene while the window is portrait (`innerHeight > innerWidth`) and touch controls are on; it is not interactive so it never blocks play, and it scales itself up so it stays readable on the shrunken portrait canvas.
- Fields on `GameScene`: `player` (`Player`), `platforms` (static group), `hazards`, `coins` (rectangle lists, each with its level `id` in `getData("id")`), `enemies` (`Enemy[]`), `goal`.

## UI (`client/src/ui`)

`App.tsx` is a placeholder. It mounts the game in a full-viewport div and destroys it on unmount. Replace it with real screens, and keep calling `mountGame` and `loadLevel` from `../game`.

## Verified

- Server pass: `npm run typecheck`, `npm run build`, `test:validate` (16 checks), `test:pipeline` (10 checks, fake model) and the offline part of `test:roast` pass. No dev server, browser or Gemini call was made.
- `npm run typecheck` and `npm run build` pass.
- Dev (prior scaffold pass): the game renders, the player runs and jumps and lands on platforms, and `loadLevel(customLevel)` rebuilds the scene with no refresh and a single canvas.
- The `/api` proxy from Vite to Express works.
- Production (`npm run build && npm start`): serves the client at `/`, falls back to `index.html` for unknown routes, and still returns JSON for `/api`.
- The gameplay loop (death/respawn/coins/win/enemy patrol), the game-feel/debug-tools pass, and the later spawn-safety / level-intro / death-visuals / audio / touch-controls pass have only been verified with `npm run typecheck` and `npm run build` so far, not by driving them in a browser yet — see "How to test" below for what to click through next.

## Not done yet

- Running `/api/level` and `/api/roast` against real Gemini: nothing has hit the API yet. The model name, `response_format` shape and the `extra_body` temperature/thinking settings follow the SDK types and docs but are unconfirmed.
- Tuning the level prompt on real photos (`samples/` is empty), and the ~8s / 1.5s latency targets.
- Deploying to Railway and testing from a phone.
- Client integration of `/api/roast` and `meta.fallback` (`App.tsx` already parses `meta`).
- Sketch upload and other UI screens.
- Sample sketches in `samples/`.
- Tests (`fixLevel` is a pure function and a good first unit-test target).
- Touch mute button (mute is keyboard-only for now).
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
- **Coyote time**: run off the edge of a platform without jumping and press jump within ~100ms of leaving it — it should still jump.
- **Jump buffer**: press jump ~100ms before landing (e.g. while still falling onto a platform) — it should jump immediately on landing instead of ignoring the press.
- **Variable jump height**: hold jump for a full jump vs. tap-and-release early — the early release should cut the jump noticeably shorter.
- **Squash and stretch**: watch the player rectangle stretch vertically on jump and squash on landing.

Then reload with `?debug=1` appended to the client URL (e.g. `http://localhost:5173/?debug=1`) and:

- **Hitboxes**: confirm Arcade's debug outlines are drawn over the player, platforms, hazards, coins, enemies, and the goal.
- **Debug text**: confirm the top-right overlay shows `attempt`, `deathsAtSpot`, and `timeAlive`, updating live.
- **Test levels**: press `1` for `easyLevel`, `2` for `spikeGauntletLevel`, `3` for `messyLevel`, and confirm each loads (no page refresh) with attempt/coins/deaths reset.
- **Messy level (`3`) doesn't crash**: confirm it loads without a thrown error or blank screen despite its duplicate/overlapping platforms, out-of-range and negative coordinates, invalid hazard type, entities missing `id`/`patrol`, and empty coins array — i.e. `sanitizeLevel` clamped/dropped the bad parts instead of `loadLevel` throwing.

### Spawn safety, intro, death visuals, sound (added since)

Try these with `?debug=1`, using `messyLevel` (`3`) and the levels' hotkeys:

- **Spawn safety**: load a level whose `start` is inside a platform/hazard or floating over a gap (edit a test level, or hand one to `loadLevel`) and confirm the player appears standing on the nearest platform's top-center. A level with `platforms: []` should get a ground strip. A coin or the goal buried in a platform should sit just above it.
- **Level intro**: on load the level name fades in, nothing moves (enemies included) for ~1.5s, then "GO!" for 0.4s and control returns. Pressing `R` (or dying) must **not** show it again, and `R` during the card does nothing. `1`/`2`/`3` show it again.
- **Death visuals**: spike -> red shards + "SPIKED"; lava -> orange/yellow burst upward + "TOASTED"; enemy side hit -> "SQUISHED"; walk off the level -> streaks + "GRAVITY WINS" (text stays on screen). Words rise and fade in ~0.7s.
- **Sound**: nothing plays before the first key press/tap; then jump, coin, death, win and stomp blips at low volume; `M` mutes/unmutes and the HUD shows "Muted (M)".

## Testing on phone

1. Vite only prints a **Network** URL when the dev server is exposed to the LAN, and `client/vite.config.ts` doesn't set `server.host` yet, so plain `npm run dev` prints just `Local`. Either add `host: true` under `server` in `client/vite.config.ts` (outside the game folder, so not done here), or run the two halves separately: `npm run dev -w server` in one terminal and `npm run dev -w client -- --host` in another. Then note the **Network** URL (e.g. `http://192.168.x.x:5173/`).
2. Put the phone on the **same wifi** as the computer and open that Network URL. The API proxy still goes through Vite, so `/api` works from the phone.
3. Touch controls appear automatically on touch devices. To see and try them on desktop, add `?touch=1` (e.g. `http://localhost:5173/?touch=1`) — the mouse can press one button at a time.
4. Check: hold right and tap jump at the same time; tap-and-release jump for a short hop; slide a thumb from left to right; the page must not scroll, zoom or open a long-press menu over the canvas; rotate to portrait and confirm the level is fully visible (letterboxed) with the "Rotate your phone" pill; win and tap anywhere to replay.

Touch-only caveats: audio unlocks on the first tap; there is no touch mute or restart button (`R`/`M` are keyboard-only; dying respawns and the win overlay is tap-to-replay). Page-level scroll/zoom outside the canvas is controlled by the UI's CSS/viewport meta, not the game.

## Known quirks

- In dev you will see harmless `Cannot suspend/resume a closed AudioContext` console errors. They come from React StrictMode mounting and destroying the game once.
- The client bundle is about 1.5 MB because of Phaser, so Vite prints a chunk-size warning.
