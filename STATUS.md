# Sketchquest: Status

Snapshot of what is implemented so far. This is a scaffold: the plumbing works, but there is no Gemini logic and no death/win logic yet.

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
- **`events.ts`**: `gameEvents`, a tiny typed emitter with `"death"` (`DeathEvent`) and `"win"` (no payload). `on()` returns an unsubscribe function. The UI/narrator subscribes here and never touches Phaser internals.
- **`api.ts`**: response types `HealthResponse`, `LevelResponse` (`{ level }`), `RoastResponse` (`{ roast }`).

Level coordinate conventions (as the game currently interprets them):

- Platforms, hazards and the goal: `x, y` is the top-left corner, `w, h` is the size.
- Start, coins and enemies: `x, y` is the center.
- `patrol` is a normalized 0-1000 distance. It is not used yet.

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
- **`loadLevel(level)`** (also `handle.loadLevel`) validates with `LevelSchema`, then restarts the scene with the new level. No page refresh is needed. If called before Phaser has finished booting, it waits for boot.
- **`GameScene`**:
  - platforms: static arcade bodies, player collides
  - hazards: spike (red) and lava (orange) with lethal collision (`cause: "spike" | "lava"`)
  - enemies: arcade physics sprites patrolling horizontally across `patrol` range (`cause: "enemy"` on touch)
  - coins: floating animation, collected on overlap with star particle burst and counter increment
  - goal: overlap triggers celebration particles, victory popup, and `gameEvents.emit("win")`
  - fall death: bottom world bound is open, falling below world triggers `cause: "fall"`
  - death & metrics: screen shake (250ms), red screen flash, shatter particles, repeat spot clustering (80px radius), emits `gameEvents.emit("death", event)`
  - game feel: jump & landing squash and stretch, dust particles, auto-respawn after 750ms
  - entity ID badges: floating labels toggleable with key `B`
- **`DeathTracker`**: manages attempts, repeat-death spot tracking, elapsed survival time, and coins.
- **`IdBadgeOverlay`**: renders floating badges (`ground-1`, `spike-1`, etc.) above entities for voice-edit add-on.

## UI (`client/src/ui`)

`App.tsx` is a placeholder. It mounts the game in a full-viewport div and destroys it on unmount. Replace it with real screens, and keep calling `mountGame` and `loadLevel` from `../game`.

## Verified

- `npm run typecheck`, `npm test`, and `npm run build` pass.
- Dev: the game renders, the player runs and jumps and lands on platforms, and `loadLevel(customLevel)` rebuilds the scene with no refresh and a single canvas.
- Lethal collision on spikes, lava, patrolling enemies, and falling into the pit emits `gameEvents.emit("death")`.
- Coin collection and goal win state emits `gameEvents.emit("win")`.
- The `/api` proxy from Vite to Express works.
- Production (`npm run build && npm start`): serves the client at `/`, falls back to `index.html` for unknown routes, and still returns JSON for `/api`.

## Not done yet

- Real `/api/level` (sketch to Gemini to `Level`, validated with `LevelSchema`) and `/api/roast`.
- Sketch upload, camera capture, and live narrator UI screens.
- Sample sketches in `samples/`.

## Known quirks

- In dev you will see harmless `Cannot suspend/resume a closed AudioContext` console errors. They come from React StrictMode mounting and destroying the game once.
- The client bundle is about 1.5 MB because of Phaser, so Vite prints a chunk-size warning.
