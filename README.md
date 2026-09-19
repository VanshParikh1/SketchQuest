# Sketchquest

Draw a level on paper, take a photo, and play it. A photo of a hand-drawn sketch goes to Gemini, which turns it into a level (platforms, hazards, coins, enemies, start and goal). The level is checked for beatability, repaired if needed, and loaded into a Phaser platformer. (Hackathon project.)

## How it works

```
photo (JPEG) ──► POST /api/level ──► Gemini vision (structured JSON)
                                          │
                       sanitize ──► reachability validator ──► repair loop (max 2 rounds)
                                          │                        │
                                     playable Level  ◄──── fallback level on any failure
                                          │
                       client: fixLevel ──► Phaser game ──► death/win events ──► POST /api/roast
```

- **Marker legend** the model is told: black = platforms, red = spikes/lava, green = goal, yellow = coins, blue circle = start, stick figure = enemy.
- **Always playable.** `/api/level` never returns a 500 for a Gemini problem. On any error, timeout, or an unbeatable result it returns a hand-made level with `meta.fallback: true`.
- **Verified with the real model.** Real phone photos have been scanned end to end: about 9s typically (one took 35s), with no repair rounds needed in 3 of 3. Level timeouts are generous on purpose (see the env table); a scan takes as long as it needs.
- **Quota-safe by default.** Mock mode, a daily call cap, an on-disk cache, and record/replay fixtures mean the whole app can run with zero Gemini calls. See [Spending and quota](#spending-and-quota).

## Quick start

```bash
cp .env.example .env   # ships with GEMINI_MOCK=1: no key needed, no Gemini calls
npm install
npm run dev            # client :5173 + server :3001
```

Open http://localhost:5173 (Vite proxies `/api` to the server on :3001).

Requires Node >= 20.11.

**Controls:** arrow keys / WASD to run, up / W / space to jump, **R** to replay, **M** to mute. Touch devices get on-screen buttons (or add `?touch=1`). Add `?debug=1` for hitboxes and hotkeys `1`/`2`/`3` that load test levels.

To use the real model, set `GEMINI_API_KEY` in `.env`, set `GEMINI_MOCK=0`, and read [Spending and quota](#spending-and-quota) first.

### Testing on your phone

The dev server listens on all interfaces (`server.host: true`) and accepts any hostname (`server.allowedHosts: true`) in `client/vite.config.ts`, and `/api` is proxied, so one URL serves both the game and the API.

- **Same wifi:** open the **Network** URL Vite prints (`http://<your-lan-ip>:5173`). Photo upload through the file picker works, but the live camera preview needs HTTPS.
- **HTTPS (camera works):** tunnel the dev server with Cloudflare, no account needed:

```bash
brew install cloudflared                            # once
npm run dev
cloudflared tunnel --url http://localhost:5173      # prints https://<random>.trycloudflare.com
```

The tunnel URL is public and changes every time you start it, and Cloudflare cuts any single request at about 100 seconds, so an unusually slow scan can fail through the tunnel. Anyone with the URL can trigger scans, so keep `GEMINI_DAILY_CAP` set. Each new photo costs 1 call (up to 3 with repairs); repeat scans of the same file are free.

## Scripts

Run from the repo root.

| Script | What it does |
| --- | --- |
| `npm run dev` | Client (Vite) and server (tsx watch) together |
| `npm run build` | Typechecks and builds the client to `client/dist` |
| `npm start` | Production: Express serves `/api` and the built client (one service) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |

Server scripts (`npm run <script> -w server`):

| Script | Spends quota? | What it does |
| --- | --- | --- |
| `test:validate` | no | Reachability validator, sanitizer and the hand-made fallback levels |
| `test:pipeline` | no | Repair loop, fallbacks, memory + disk cache, mock mode, daily cap, record/replay and the live-roast gate. Fully offline: a fake key and temp dirs are swapped in first |
| `test:roast` | **yes** | Offline format checks, then 5 death contexts x 3 runs against the model with min/median/max latency and MODEL vs FALLBACK counts (15 calls) |
| `run-samples` | **yes** | Runs every image in `samples/` through the full pipeline and prints level name, entity counts, reachable, repairs, fallback and ms (up to 3 calls per image) |

`test:roast` and `run-samples` **refuse to run without `--live`**. They print an estimate and today's usage and exit. npm needs the extra `--`:

```bash
npm run test:roast -w server -- --live
npm run run-samples -w server -- --live
```

With `--live` they respect `GEMINI_DAILY_CAP` and abort mid-run when it is reached instead of finishing.

## Spending and quota

Everything below is read at request time; booleans accept `1`/`true`. The free tier is tiny (5 requests/minute and 20 requests/day for `gemini-3.8-flash`), so the defaults are conservative.

| Layer | What it does |
| --- | --- |
| `GEMINI_MOCK=1` | `/api/level` and `/api/roast` never call Gemini. Levels arrive after 2-4s of fake latency (rotating hand-made levels), roasts after 300-1200ms (canned, escalating, never repeating recent lines). `/api/health` reports `"mode": "mock"` |
| `GEMINI_LIVE_ROAST=0` (default) | Roasts come from the canned escalating pool even if a key is set. Keep it `0` until the AI narrator is switched on |
| `GEMINI_DAILY_CAP=15` (default) | Max real requests per local day, counting repair rounds. Persisted in `server/.cache/usage.json`, resets at local midnight. At the cap, live calls are skipped and fallbacks are used (logged once). `0` = unlimited |
| Level cache | Results are cached in memory and on disk (`server/.cache/levels/<image hash>.json`, gitignored) by image hash, so a repeat scan costs no call, even after a restart. Fallbacks are never cached |
| `GEMINI_RECORD=1` / `GEMINI_REPLAY=1` | Save every real response to `server/fixtures/` (commit them), then serve from them with zero API calls. Filenames hash the prompt, so a prompt change needs a re-record. A few real level responses are already committed |

`GET /api/usage` (not registered in production) shows today's count against the cap.

## API

| Route | Description |
| --- | --- |
| `GET /api/health` | `{ ok: true, mode: "mock" \| "live" }`. Never includes the key |
| `POST /api/level` | Body `{ image }` (base64 JPEG; a `data:` prefix is accepted). Returns `{ level, meta: { repairs, fallback } }`. 400 for a missing, oversized or non-base64 image |
| `POST /api/roast` | Body `{ levelName, cause, attempt, deathsAtSpot, coins, timeAlive, recentRoasts? }`. Returns `{ line }`. Always 200 for a valid body: a timeout, error or spent cap yields a canned line |
| `GET /api/usage` | Non-production only: real-call count, cap, remaining and flags |

Types and Zod schemas for these live in `shared/api.ts`. Errors from the server are JSON.

## Deploy

Deploys as one service (built for Railway, works anywhere that runs Node >= 20.11).

| Setting | Value |
| --- | --- |
| Build command | `npm run build` (typechecks and builds `client/dist`) |
| Start command | `npm start` (Express serves `/api` and `client/dist`; sets `NODE_ENV=production`) |
| Health check | `GET /api/health` |

Camera capture needs HTTPS, so test from a phone on the deployed URL. Never commit `.env`; on Railway set the variables below in the service settings instead.

### Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `GEMINI_API_KEY` | none | Required for live calls. Without it (and without replay) the API serves fallback levels and canned roasts |
| `NODE_ENV` | none | `production` makes Express serve the built client and disables `/api/usage` (`npm start` sets it) |
| `GEMINI_MOCK` | `0` | `1` = no Gemini calls, canned data with fake latency |
| `GEMINI_MOCK_FALLBACK` | `0` | With `GEMINI_MOCK=1`, mock levels return `meta.fallback: true` to test the client's fallback state |
| `GEMINI_LIVE_ROAST` | `0` | `1` = `/api/roast` may call Gemini (canned line on error/timeout/cap) |
| `GEMINI_DAILY_CAP` | `15` | Real requests per local day; `0` = unlimited |
| `GEMINI_RECORD` | `0` | Save real responses to `server/fixtures/` |
| `GEMINI_REPLAY` | `0` | Serve Gemini calls from `server/fixtures/`; a missing fixture errors clearly (the endpoint still returns a fallback level) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Level generation model |
| `GEMINI_ROAST_MODEL` | `GEMINI_MODEL` | Roast model |
| `GEMINI_LEVEL_THINKING` / `GEMINI_ROAST_THINKING` | `low` | `low`, `medium` or `high` (`minimal` is rejected by the API) |
| `GEMINI_LEVEL_TIMEOUT_MS` / `GEMINI_LEVEL_REPAIR_TIMEOUT_MS` / `GEMINI_LEVEL_BUDGET_MS` | `120000` / `120000` / `300000` | Timeouts for the first level call, each repair call, and the whole scan. A vision call with JSON output took longer than the original 6s, which silently produced a fallback level |
| `GEMINI_ROAST_TIMEOUT_MS` | `2500` | Server-side roast timeout. The client cutoff should be this + ~500ms |
| `PORT` | `3001` | Injected by the platform |

### Recommended settings

| Situation | Settings |
| --- | --- |
| Local dev (default) | `GEMINI_MOCK=1` (zero calls, no key needed) |
| Test-key day (small quota) | `GEMINI_MOCK=0`, `GEMINI_LIVE_ROAST=0`, `GEMINI_DAILY_CAP=15`, `GEMINI_RECORD=1` so every real response is captured once; afterwards use `GEMINI_REPLAY=1` |
| Offline with recorded fixtures | `GEMINI_REPLAY=1` (with `GEMINI_LIVE_ROAST=1` to replay roasts too) |
| Prod / demo | `GEMINI_API_KEY` set, `GEMINI_MOCK=0`, `GEMINI_LIVE_ROAST=1` once the AI narrator is on (else `0`), `GEMINI_DAILY_CAP` high or `0`, paid tier |

## Layout

| Path | What |
| --- | --- |
| `client/src/game` | Phaser game: `mountGame`, `loadLevel`, `GameScene`, player/enemy/effects/audio/touch controls |
| `client/src/ui` | React screens: photo upload/camera, then the game |
| `server` | Express API and the Gemini pipeline (`levelFromSketch`, `roast`, `gemini`, `budget`, `mock`, `serve`, caches, fixtures) |
| `server/scripts` | Tests and live scripts (see [Scripts](#scripts)) |
| `shared` | `@sketchquest/shared`: constants, Zod level schema and `sampleLevel`, API types, `sanitizeLevel`, the reachability `validateLevel`, and the typed `gameEvents` bridge |
| `samples` | Photos of real sketches for `run-samples` |

Level coordinates are normalized 0-1000 with the origin top-left; the game world is 1600x900. Platforms, hazards and the goal use `x, y` as the top-left corner; the start, coins and enemies use it as the center.

`STATUS.md` has the detailed, current implementation notes and a manual test checklist.

## Later enhancement: multi-photo levels

Allow players to capture or upload several numbered sketch frames, reorder or remove them, and build a longer level by placing the frames side by side. Before implementation, align the frontend, backend, and game on the multi-image request format and how wider scrolling worlds are represented; the current level schema uses normalized `0-1000` coordinates and the game uses a fixed `1600x900` world.
