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
| React screens | `client/src/ui` | UI dev (`App.tsx`: photo upload/camera, then the game) |
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
| `GET /api/health` | Returns `{ ok: true, mode: "mock" \| "live" }` (never the key) |
| `GET /api/usage` | Non-production only: today's real-call count, cap, remaining, mode and flags |
| `POST /api/level` | Real. Body `{ image }` -> `{ level, meta }`. 400 for a missing, oversized (> 12M base64 chars), non-base64 or non-JPEG/PNG/WebP image. Never 500s for Gemini failures: any error, timeout or unbeatable result returns a hand-made level with `meta.fallback: true` |
| `POST /api/roast` | Real. Body `RoastRequest` -> `{ line }`. 400 only for a malformed body. Model timeout is `GEMINI_ROAST_TIMEOUT_MS` (default 2500ms) with SDK retries off; on timeout/429/error/junk output it returns a canned line for the cause, still with status 200 |

Files in `server/`:

- `env.ts`: loads the repo-root `.env` (side-effect import, first in `index.ts` and the scripts).
- `config.ts` (env flags), `budget.ts` (persisted daily call cap), `fixtures.ts` (record/replay), `levelCache.ts` (disk cache), `mock.ts` (mock mode), `serve.ts` (what the endpoints serve given the flags; `index.ts` calls `serveLevel`/`serveRoast`).
- `gemini.ts`: `@google/genai` Interactions API wrapper (`generate()`, `withTimeout()`, `GEMINI_MODEL` default `gemini-3.8-flash`). The SDK's `generation_config` type has no `temperature`, so it is sent via `extra_body`. Against gemini-3.8-flash it is accepted (no 400), but whether the value is honored is unverified. Guard: a 400 that succeeds when retried without temperature disables it for the process and logs once. Thinking level must be `low`/`medium`/`high` (`minimal` is rejected with a 400); it comes from `GEMINI_ROAST_THINKING` / `GEMINI_LEVEL_THINKING` (default `low`, invalid values fall back to `low` with a warning). `max_output_tokens` includes thinking tokens: 80 left the roast with no text (`status: incomplete`), so the roast uses 512.
- `prompts.ts`, `levelFromSketch.ts`: one structured-output call (photo + system prompt, schema from `z.toJSONSchema(LevelSchema)`), then sanitize -> `validateLevel`. If unreachable it sends the photo, the level JSON and the validator report back for minimal edits (max 2 rounds). Timeouts are `GEMINI_LEVEL_TIMEOUT_MS` (first call, default 120s), `GEMINI_LEVEL_REPAIR_TIMEOUT_MS` (each repair, 120s) and `GEMINI_LEVEL_BUDGET_MS` (whole scan, 300s; repairs are skipped once it is spent). The defaults only stop a truly hung request (a Cloudflare quick tunnel still cuts any request at ~100s). They were 6s / 4s / 8s until the first real phone photo timed out at 6s and silently returned a fallback level. Stage timings are logged.
- `fallbackLevels.ts`: three hand-made levels (all checked by `test-validate.ts`), picked by image hash.
- Cache: in-memory, sha256 of the image, max 200 entries, plus in-flight dedupe of identical concurrent scans. Fallbacks are not cached, so a retry gets another shot at Gemini.
- `roast.ts`: prompt (PG-13, one sentence, 20 word cap, escalates with `deathsAtSpot`, never repeats `recentRoasts`), output cleanup (first sentence, quotes stripped, truncated to 20 words) and the per-cause fallback pool. The client sends `recentRoasts` (last 3); the server keeps no roast state.
- `sketchImage.ts`: image body parsing (raw base64 or data URL).
- `index.ts`: JSON body limit 20 MB, one-line request log for `/api`, JSON 404 for unknown `/api` routes, and a global JSON error handler.
- `.env` is loaded from the repo root. In production the server runs through `tsx` (no compile step), because `shared` is TypeScript source.

Scripts (from the repo root, `-w server`): `test:validate` (validator, sanitizer, fallback levels), `test:pipeline` (repair loop, fallback, memory + disk cache, mock mode, daily cap, record/replay and the live-roast gate; fully offline, `scripts/offline-env.ts` swaps in a fake key and temp dirs first), `test:roast` (offline format checks, then 5 death contexts x 3 runs against the model, 15 calls) and `run-samples` (runs every image in `samples/` through the full pipeline and prints level name, entity counts, reachable, repairs, fallback, ms; up to 3 calls per image). **The last two spend real quota and refuse to run without `--live`**: without it they print the estimated call count and today's usage (from `budget.ts`) and exit 1; with it (`npm run test:roast -w server -- --live`) they respect `GEMINI_DAILY_CAP` and abort mid-run when it is reached. The shared guard is `scripts/live-guard.ts`.

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
  - **`RunRecorder.ts`** / **`Replay.ts`** / **`ReplayUi.ts`**: the winning-run replay, see "Winning-run replay" below.
  - **`WinOverlay.ts`**: the "LEVEL CLEAR" / time / coins / "press R or tap to replay" overlay shown on reaching the goal. Tapping/clicking anywhere replays too (armed 500ms after the overlay appears so jump-mashing at the goal can't skip it).
  - **`DebugOverlay.ts`**: `?debug=1`-only text (top-right) showing `attempt`/`deathsAtSpot`/`timeAlive`/`assists` each frame and a `[1/2/3] test levels  [Shift+D] copy level` hint.
- Gameplay loop implemented in `GameScene`:
  - **Death**: overlap with a spike/lava hazard, touching an enemy from the side/below, or falling past `WORLD_H + 100`px all fire exactly one `"death"` event via `gameEvents` (guarded by a `dead` flag), then play the death effect and respawn at the level start ~600ms later with coins reset. Landing on top of an enemy (falling, feet above its midpoint) kills the enemy and bounces the player instead of killing them.
  - **Coins**: collide via overlap, disappear, trigger a particle burst, and increment the HUD counter. They reappear (and the counter resets) on respawn or replay.
  - **Win**: overlap with the goal fires `"win"` with `{ coins, timeAlive }`, locks movement (via the same `locked` flag death uses), then loops a replay of the run (falls back to the full `WinOverlay` if no usable recording exists).
  - **R** (or a tap, while the win overlay/replay is up) restarts the level (`GameScene.restartLevel()`, formerly `replay()`): resets to the start with coins/time cleared and the win overlay (if any) dismissed, without counting as a death or incrementing `attempt`.
  - **Debug only (`?debug=1`)**: hitboxes are drawn (Arcade's own debug renderer), the debug text overlay is shown, and pressing `1`/`2`/`3` loads `easyLevel`/`spikeGauntletLevel`/`messyLevel` via `this.scene.restart()` (through the same sanitize -> `LevelSchema.parse` pipeline as `loadLevel`).
- **Touch controls** (`TouchControls.ts`): shown when Phaser detects a touch device (`sys.game.device.input.touch`) or the URL has `?touch=1`. Left/right buttons bottom-left and a jump button bottom-right, 120 world px each, semi-transparent rounded squares with arrow glyphs, pinned to the camera (`setScrollFactor(0)`). Every frame it polls all pointers against the button rects (so multi-touch works and a thumb can slide between buttons) and the result is OR'd with the keyboard into the same `MoveInput`, so coyote time, jump buffering and variable jump height (release jump = short hop) work identically. It tops up touch pointers to 3 (the same effect as `input.addPointer(2)`, but without stacking extra pointers on every scene restart). `touchLock.ts` sets `touch-action: none` and no-select/no-callout styles on the canvas and `preventDefault`s touch events and `contextmenu` on it (`mountGame` applies it once Phaser has booted).
- **Phone scaling**: the scale mode is `FIT` (1600x900 letterboxed and centered, never cropped) in both orientations; Phaser re-measures the parent on `resize`/`orientationchange` and every 500ms. `RotateBanner.ts` draws a small "Rotate your phone" pill at the top of the scene while the window is portrait (`innerHeight > innerWidth`) and touch controls are on; it is not interactive so it never blocks play, and it scales itself up so it stays readable on the shrunken portrait canvas.
- Fields on `GameScene`: `player` (`Player`), `platforms` (static group), `hazards`, `coins` (rectangle lists, each with its level `id` in `getData("id")`), `enemies` (`Enemy[]`), `goal`.

### Winning-run replay (`RunRecorder.ts`, `Replay.ts`, `ReplayUi.ts`)

- **Recording.** `RunRecorder` samples the current attempt at 30 Hz of game time (`scene.time.now`, one sample per 1/30 s slot, only while unlocked) into preallocated typed arrays (~1 MB worst case): per sample a timestamp, player x/y/scaleX/scaleY and a pose bitfield (running, airborne, rising, landing, facing left), and per enemy x/y and a flag byte (alive, facing left). Coin pickups, stomps and jumps are timestamped event lists. `clear()` runs at every attempt start (level intro end, death respawn, R restart, new level), so only the current attempt is kept. Capped at 120 s (3602 samples); a longer attempt is marked overflowed and gets no replay. `triggerWin` calls `finish()`, which writes a closing sample exactly at the goal.
- **Replay mode.** On win, if the recording is usable (finished, not overflowed, at least 2 samples and 300 ms), the next `update()` pauses the physics world, shrinks the win overlay to a translucent top-right panel (`WinOverlay` `compact`: LEVEL CLEAR, time, coins, deaths = `attempt - 1`, attempt number) and creates a `ReplayController`. No physics is simulated: the controller hides the live enemies and player body, shows the coins again, and each frame interpolates the recorded samples. The player is drawn by the real `Player` art (`drawReplay` uses the same `paint()` cache and `drawPlayer` as live play, with the recorded squash/stretch scale), enemies by ghost Graphics using the same `drawEnemy` (`redrawEnemy` in `Enemy.ts`). Coin pickups (hide + `coinBurst` + `playCoin`), stomps (ghost vanishes at the exact recorded time + `enemyDeathBurst` + `playStomp`) and jump sounds fire from the event lists; all sounds go through `audio.ts`, so mute is respected. Enemies that were already dead at attempt start (killed in an earlier attempt; kills persist across attempts as before) stay hidden.
- **Loop.** At the end of the recording it holds 0.8 s, then restarts from the beginning, forever. The first pass plays the last 0.5 s at 0.5x; later loops are normal speed. A fading trail of the last 10 positions follows the player. `ReplayUi` adds the top-center "REPLAY" badge with a pulsing red dot and a hand-drawn "press R / tap to play again" prompt at the bottom. Everything is driven from `update()` (no timers or tweens of its own); particles use the existing short tweens and budget.
- **Leaving.** R or a tap calls `restartLevel()`, which destroys the controller (restores enemies, player body/art, kills the squash tween), resumes physics and then restarts exactly like the old R restart (not a death, `attempt` unchanged). `loadLevel`/debug hotkeys restart the scene, which drops replay mode.
- **Fallback.** No recording / overflow / instant goal: the original full-size win overlay and post-win behavior, no replay.
- Verified with `npm run typecheck` and `npm run build` only. Not yet watched in a browser: check the loop feel, slow-mo, trail, the stomp timing, that the corner panel doesn't collide with the debug overlay (`?debug=1`, also top-right), and that R/tap out of replay leaves nothing behind.

### Art pass: marker sketch on notebook paper (visual only)

Everything is procedural (Phaser Graphics, one canvas texture, one RenderTexture per level); no asset files. Physics, hitboxes and level logic are untouched: every level rectangle, coin, enemy and the player is still the same Arcade body, now on an `alpha 0` rectangle ("carrier") with the art drawn over it. `?debug=1` still shows Arcade's hitbox outlines: `GameScene.create` lifts `physics.world.debugGraphic` to `DEPTH.debugHitboxes` so they sit above the art.

- **`sketch.ts`**: the marker helpers, all driven by a seeded `Rng` (`seededFor(id, variant)`, FNV-1a + mulberry32). `sketchLine` = two overshooting passes with a bow, endpoint jitter and per-chunk width changes; `sketchPoly`/`sketchRect` jitter corners then stroke each edge; `sketchEllipse`/`sketchCircle` are loose 1-2 loop scribbles; `hatchPoly` is a scribble fill clipped to any polygon (chained zig-zag for convex shapes, capped at 120 rows); `jitterPoints` + `fillPoly` give fills that match the outline. Non-finite or degenerate input is skipped, never thrown (the messy level has 1.6px-wide platforms).
- **`paper.ts`**: notebook page generated once per game into the `sq-paper` canvas texture (off-white, soft blotches, a 256px grain tile repeated, faint blue rules every 48px, faint red margin line at x=158, vignette). `addPaper` just places the image at depth -100 on each scene start.
- **`staticArt.ts`**: `renderStaticLevel` draws platforms (paper fill, grey hatch, black outline), spike rows (one red hatched triangle per ~30px of hazard width), the lava body (orange hatch + sides/bottom) and the goal door (green, panel and knob) into one 1600x900 RenderTexture per level load. Never redrawn.
- **`animatedArt.ts`**: `LevelDoodles` owns the animated non-character art: lava top wave + rising bubbles, coins (yellow marker circle, scribble highlight, twinkle; bob is applied by moving the Graphics each frame, the wobble only redraws on boil ticks; they hide when their carrier is collected), and a "GOAL" label with a pulsing star.
- **`characterArt.ts`**: `drawPlayer` (round blue body with hatch, tuft, two eyes that blink every 26 ticks, feet that swing while running and tuck in the air, "o" mouth in the air) and `drawEnemy` (dark stick figure: head, body, swinging arms and legs, angry brows). `Player.draw`/`Enemy.draw` follow `body.center` every frame; the player copies the carrier's scale so the existing squash/stretch tweens still work, and facing flips with a negative `scaleX` (enemies face their patrol direction).
- **Boil**: `boilTick` = `floor(time.now / 125ms)` (~8 fps). Animated art redraws only when the tick (or a pose flag) changes, and uses `seededFor(id, tick % 3)`: three fixed wobble poses per entity that cycle, so it reads as hand-animated while staying a pure function of the id (no random shimmer). Static geometry is never redrawn.
- **Text/HUD**: `HAND_FONT` and marker colors (`palette.ts`: `INK`, `INK_CSS`, `DEPTH`). HUD is a doodled coin + marker text + hand underline, rotated slightly; floating words keep their random tilt with a paper-colored outline; the win overlay and level intro are paper cards with a wobbly outline; touch buttons are wobbly outlined squares with marker arrows (seeded per button so press/release doesn't change the wobble).
- **Performance guards**: no texture generation after level load (paper is once per game, the RenderTexture once per level); more than 40 coins stops their boil (bob continues); particles are capped at 60 live per scene (`particles.ts`, reset each scene create) and now draw at depth 100 above the art; hatch density is bounded, and the Graphics per coin/enemy is small.
- **Depths**: paper -100, static layer -10, lava 2, goal 3, coins 5, enemies 10, player 12, particles 100, HUD 1000, debug hitboxes 900.
- **Not seen in a browser yet** (typecheck, build and a headless smoke test of `sketch.ts` with mock Graphics only: no NaNs, deterministic per id, full-screen hatch ~480 draw commands). Things to eyeball: wobble amplitude and line weights at phone size, the paper grain/rules not fighting platform readability, feet/leg swing at 8 fps, hitboxes vs art alignment with `?debug=1` (coin bob is +-3px and the player's hair tuft pokes ~4px above the hitbox by design), and the messy level (`3`).

### Narrator (`client/src/game/narrator/`, local only, no API calls)

Nothing existed client-side before this (checked `client/`, every remote branch and history for SpeechSynthesis/narrator/`/api/roast` callers): the only related code is server-side (`/api/roast`, `server/roast.ts`'s own canned pool) and the shared `RoastRequest` type. This is a separate, client-local pool; it does not call or duplicate the server one.

- **`lines.ts`**: 148 templates. Death lines for spike/lava/enemy/fall x 3 tiers keyed by `deathsAtSpot` (1 = tease, 2 = sharper, 3+ = brutal/specific), 7 per cell (spec: 4+). Plus situational death lines (carrying coins, dying in under 2.5s, dying after 20s+, attempt 8+), intro, first coin, all coins, win (flawless = 0 deaths on the level, few = 1-3, many = 4+) and milestone jabs (5th and 10th death this session). Placeholders: `{attempt} {deathsAtSpot} {coins} {coinsLabel}` ("1 coin"/"3 coins") `{timeAlive} {levelName}` plus `{totalDeaths} {levelDeaths}`. Roasts the play, never the person, PG-13.
- **`pick.ts`** (pure, no Phaser/DOM): `pickLine(trigger, ctx)` fills placeholders, never reuses any of the last 6 templates, and among the rest prefers the least-used ones. If a cell is exhausted it borrows from neighbouring tiers; a quarter of deaths swap in an applicable situational line. `createPicker(rng)` is the injectable version used by the script. Re-exported from `narrator.ts`.
- **`narrator.ts`**: session-wide singleton subscribed to `gameEvents` `death`/`win`. `GameScene` calls `bind` (each create; per-level counters reset, total deaths persist), `onLevelIntro`, `onCoin`, `onMuteChanged`, `update`. Priorities: `high` (level intro, win, 5th/10th-death milestone) interrupts; `normal` (deaths, all coins) and `low` (first coin) are skipped while a line is still speaking/showing or within 2.5s of the last one. The level's own `intro` string (capped at 140 chars, control chars stripped) is spoken before the intro quip. First-coin and all-coins fire once per level. `LineSource { getLine(ctx): Promise<string> }` with `LocalLineSource`; `createLineSource()` reads `VITE_LIVE_ROAST` (default off) but always returns the local source. **TODO(live-roast)**: a source that POSTs `RoastRequest` to `/api/roast` with a ~3s abort (server cutoff is `GEMINI_ROAST_TIMEOUT_MS` + ~500ms), sends `recentLines` as `recentRoasts`, and falls back to local on any failure; only deaths map to the endpoint. Not implemented.
- **`speech.ts`**: `speechSynthesis`, pitch 0.9, rate 1.05, English voice chosen once and cached (prefers Daniel, Samantha, Google UK English, Alex...; retries until the voice list loads), cancels the line in progress before speaking, respects the existing `M` mute, and silently does nothing when unsupported or blocked. The first key/pointer/touch primes the engine with a silent utterance (iOS needs a gesture).
- **`bubble.ts`**: paper bubble with a wobbly marker outline, 36px handwriting text, typewriter synced to an estimated speech duration (14.5 chars/s; ~30 chars/s when captions only), then fades. Text is pre-wrapped and the bubble is sized for the full line, so typing never reflows. Sits above the player (smoothed, with a tail) and clamps to the top of the screen when there is no room; wins pin to the top so the win overlay stays clear. Depth 2400.
- **Mute**: `M` now also cuts off speech; captions keep showing. The HUD has a `Narrator: ON` / `Narrator: OFF (captions)` label next to the muted label (OFF when muted or the browser has no speech).
- **`npm run narrator:samples -w client`** prints 20 sample death lines (4 causes x deathsAtSpot 1, 2, 3, 4, 7), one line for every other trigger, and runs pool checks (4+ lines per death cell, no unfilled placeholders, banned-word list, at most 22 words, no duplicates, no repeat inside the last 6 over 400 draws). `-- --all` prints the whole death pool. I read the samples and rewrote lines that were flat or contradicted the art.
- **Not verified in a browser or with a real voice** (typecheck, build and the script only). Check: voice choice and pitch on desktop Chrome, Safari and iOS, whether the first line is blocked before any in-game input, bubble size/legibility on a phone, bubble vs win overlay/touch buttons, and that intro speech survives the level-intro freeze.

### Assist platforms and the stuck helper (client only, no API calls)

- **Convention:** any platform whose id starts with `assist-` is a helper platform. There is no schema field. The server's repair step adds `assist-N`; the in-game stuck helper adds `assist-live-N`. Physics are identical to any other platform (same static body, same collider); only the art differs.
- **`assistArt.ts`**: `isAssist(id)`, `countAssists(platforms)`, `drawAssistPlatform` (faint paper wash + dashed light-grey pencil outline, seeded by id, no hatch) and `showAssistTag` (a tiny handwritten "assist" that fades in above the platform, holds ~3s, fades out and is destroyed). `staticArt.ts` calls `drawAssistPlatform` instead of `drawPlatform` for assist ids, so level-loaded assists still bake into the one static RenderTexture. Their tags appear once when the level intro ends (not on R restarts or respawns); a live helper shows its tag the moment it spawns.
- **Stuck helper** (`StuckHelper.ts` state + UI, `helperPlatform.ts` placement, `GameScene.useHelper`): after each death, if `AttemptState.deathsWithin(x, y, 150)` (new method, same death list `deathsAtSpot` uses; `deathsAtSpot` itself is unchanged at 100px) is 6 or more, the hint "Stuck? Press H (or tap the bulb) for a helper platform" appears bottom-center and stays until a helper is used. On touch devices (or `?touch=1`) a hand-drawn light-bulb button also appears above the jump button while the hint is on. H (polled like M/R) or a tap on the bulb spawns ONE platform `assist-live-N`, 110 x 22 level units (~176 x 20 px). Not while dead, in the level intro, or after a win. Max 3 per level load; `respawn` and `R` keep the count, `loadLevel`/debug hotkeys reset it (a new `StuckHelper` per `create`). After a helper is placed the offer is cleared, and the next death still inside the 150px streak re-arms it.
- **Placement** (`findHelperRect`, pure, no Phaser): anchored on the death x and the player's feet height at death (for a fall death, the feet height where they last stood on something, tracked in `GameScene.lastGrounded`, since the death y is below the world). Tries 80/100/60/120px above the feet and 40/100/0/160/-40/-100/220px "ahead" (toward the goal's side), taking the first spot that touches no platform (6px pad), hazard (12px pad) or the goal, leaves a 52px column of headroom above it, and does not land on the player. Nothing fits -> a red "NO ROOM" word and no helper is used up. Offline check against the sample and fallback levels with random death spots: 0 overlaps or out-of-world placements in 1200 trials (16 had no room).
- **On spawn:** the platform is added to the same static group as level platforms (so the player and enemy colliders pick it up), its art is its own small Graphics (200ms fade in, not a rebake of the static layer), `playHelper()` (soft two-note rise in `audio.ts`, respects mute) and two grey/paper `burstParticles` puffs.
- **Debug:** `Shift+D` in `?debug=1` logs `this.level` (as loaded, after sanitize + fix, without live helpers) and copies it to the clipboard, with a "COPIED" / "SEE CONSOLE" word. It is Shift+D rather than D because plain D is already "move right". The overlay's `assists: N` counts assist ids in the loaded level plus live helpers.
- **Untouched:** physics constants, hitboxes and the recording/replay code. A live helper is a scene object, so it stays visible during the winning-run replay.
- **Not verified in a browser** (typecheck and build only): the dashed look at phone size, hint/bulb placement against touch buttons and the narrator bubble, clipboard permission (needs a secure context or localhost), and a real run of dying 6 times to see the offer and the helper feel. Quick way to try it: `?debug=1`, die 6 times in one spot, press H.

## UI (`client/src/ui`)

`App.tsx` lets the player upload or take a photo (camera capture needs HTTPS), sends it to `/api/level`, and then mounts the game with the returned level. It parses `meta` but does not yet show `meta.fallback`, so a stand-in level looks like a successful scan. Keep calling `mountGame` and `loadLevel` from `../game`.

**Scan loading screen (`ScanLoader.tsx` + `ScanLoader.css`, new files).** While `/api/level` is in flight, `App.tsx` renders `<ScanLoader>` instead of the capture page (the only `App.tsx` changes: the import, a separate `scanError` state so scan failures no longer land in the capture page's `error` banner, `playSample`, and the early return). It shows the uploaded photo full-width and dimmed with a green scan line sweeping over it, a faint grid and yellow corner brackets; a 5-stage checklist that advances every 5s on a client timer (the server sends no progress) and stays on the last stage without looping; an elapsed timer (`12s`); "Big drawings take a little longer, still working..." after 20s and "Hang tight, almost there..." after 60s; an SVG doodle (red squiggle that draws itself, blue runner on a line with a coin and a green flag); and a tip that rotates every 6s. On failure the same screen shows the error with **Try again**, **Play a sample level** (loads `sampleLevel` from `@sketchquest/shared` straight into the game) and a "Choose another photo" link. `prefers-reduced-motion` turns off the sweep, the doodle animation and the pulses (stages and tips still change, as text). Colors are the game's marker palette and the font is the same handwriting stack as `HAND_FONT`. The old `.loading-cover` is still used for "Preparing photo..."; its `submitting` branches in `App.tsx` are now unreachable.

## Verified

- **Real Gemini, `/api/level`:** three phone photos scanned end to end through the dev server (and over a Cloudflare tunnel): 9s, 35s and 9s, zero repair rounds, all non-fallback. The model name (`gemini-3.8-flash`), `response_format` JSON schema, `system_instruction` and `thinking_level: low` are confirmed working. The first attempt hit the original 6s timeout and silently returned a fallback level, so the level timeouts are now 120s / 120s / 300s. The three responses are recorded in `server/fixtures/`.
- Server pass: `npm run typecheck`, `npm run build`, `test:validate` (16 checks), `test:pipeline` (10 checks, fake model) and the offline part of `test:roast` pass. No dev server, browser or Gemini call was made.
- `npm run typecheck` and `npm run build` pass (also after the art pass).
- Dev (prior scaffold pass): the game renders, the player runs and jumps and lands on platforms, and `loadLevel(customLevel)` rebuilds the scene with no refresh and a single canvas.
- The `/api` proxy from Vite to Express works.
- Production (`npm run build && npm start`): serves the client at `/`, falls back to `index.html` for unknown routes, and still returns JSON for `/api`.
- The gameplay loop (death/respawn/coins/win/enemy patrol), the game-feel/debug-tools pass, and the later spawn-safety / level-intro / death-visuals / audio / touch-controls pass have only been verified with `npm run typecheck` and `npm run build` so far, not by driving them in a browser yet — see "How to test" below for what to click through next.

## Not done yet

- Running `/api/roast` against real Gemini with `GEMINI_LIVE_ROAST=1` at the corrected timeout (a real roast call took ~1.6-3.4s and hit the free-tier daily cap before numbers could be collected). `/api/level` is verified, see below.
- Tuning the level prompt on more real photos (`samples/` is empty; latency varies 9-35s so far, and the old ~8s target is gone).
- Deploying to Railway and testing from a phone.
- Client integration of `/api/roast` and `meta.fallback` (`App.tsx` already parses `meta`).
- Sketch upload and other UI screens.
- Sample sketches in `samples/`.
- Tests (`fixLevel` is a pure function and a good first unit-test target).
- Touch mute button (mute is keyboard-only for now).
- Manual/browser verification of this pass (see above).
- Browser check of the scan loading screen: phone portrait layout (photo height, whether the stage list + tip fit without scrolling on short phones), scan-line/doodle look, the error card, and reduced-motion. Only `npm run typecheck` and `npm run build` were run for it.

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

## Latency and rate limits

- **Paid tier required.** The free tier for gemini-3.8-flash allows 5 requests/minute and only 20 requests/day (the daily cap was hit during testing, after which every call returned 429). A level scan (1 call + up to 2 repairs) plus a roast per death exceeds that within seconds, and every 429 becomes a fallback level or canned roast.
- **Spend controls (see README Deploy for the full table and recommended combos):** `GEMINI_MOCK=1` runs everything with zero Gemini calls; `GEMINI_LIVE_ROAST` (default 0) keeps roasts on the canned pool; `GEMINI_DAILY_CAP` (default 15, 0 = unlimited) counts real requests persisted in `server/.cache/usage.json`; `GEMINI_RECORD` / `GEMINI_REPLAY` save/serve `server/fixtures/`. Level results are also cached on disk by image hash.
- **Timeouts and models (env):** `GEMINI_ROAST_TIMEOUT_MS` (default 2500; roast calls also run with SDK retries off so a 429 or slow call falls straight to the canned line), `GEMINI_MODEL`, `GEMINI_ROAST_MODEL`, `GEMINI_ROAST_THINKING`, `GEMINI_LEVEL_THINKING`. Level generation keeps the SDK's default retries, but each call's timeout is capped by what is left of the level budget (`GEMINI_LEVEL_BUDGET_MS`), so retries cannot push a scan past it.
- **Client cutoff (dev 3's roast fetch) should be `GEMINI_ROAST_TIMEOUT_MS` + ~500ms** (3000ms at the default) so the server's canned line still arrives instead of the client giving up first. It was 1500ms when the server timeout was 1200ms.
- Last measurement (free tier, before the daily cap): roast calls at `low` thinking took ~1.6-3.4s typical with occasional 11-12s spikes, so expect some canned lines even at 2500ms. With retries off, a 429 falls back in ~150-500ms. Real numbers on the paid tier are still to be measured.
- `npm run test:roast -w server -- --live` runs each death context 3 times and prints min/median/max latency and the MODEL vs FALLBACK count.

## Known quirks

- In dev you will see harmless `Cannot suspend/resume a closed AudioContext` console errors. They come from React StrictMode mounting and destroying the game once.
- The client bundle is about 1.5 MB because of Phaser, so Vite prints a chunk-size warning.
