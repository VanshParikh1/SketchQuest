# Sketchquest

Hand-drawn sketch → Gemini → playable Phaser platformer. (Hackathon project.)

## Run

```bash
cp .env.example .env   # add GEMINI_API_KEY (without it, /api/level serves fallback levels and /api/roast canned lines)
npm install
npm run dev
```

Client: http://localhost:5173 (Vite, proxies `/api` to the server)
Server: http://localhost:3001

Controls: arrow keys / WASD to run, up / W / space to jump.

## Production (single service, e.g. Railway)

```bash
npm install && npm run build   # builds client/dist
npm start                      # Express serves /api and client/dist
```

`PORT` is read from the environment (default 3001).

## Deploy

Deploys as one service (built for Railway, works anywhere that runs Node >= 20.11).

| Setting | Value |
| --- | --- |
| Build command | `npm run build` (typechecks and builds `client/dist`) |
| Start command | `npm start` (Express serves `/api` and `client/dist`) |
| Health check | `GET /api/health` returns `{ "ok": true }` |

Environment variables (all Gemini/spend controls are read at request time; booleans accept `1`/`true`):

| Variable | Default | What it does |
| --- | --- | --- |
| `GEMINI_API_KEY` | none | Required for live calls. Without it (and without replay) the API serves fallback levels and canned roasts |
| `NODE_ENV` | none | Set `production` so Express serves the built client (`npm start` already sets it). Also disables `/api/usage` |
| `GEMINI_MOCK` | `0` | `1` = `/api/level` and `/api/roast` never call Gemini: level after 2-4s fake latency (rotating hand-made levels, `meta.fallback: false`), roast after 300-1200ms (canned, escalating, never repeating `recentRoasts`). `GET /api/health` reports `"mode": "mock"` |
| `GEMINI_MOCK_FALLBACK` | `0` | With `GEMINI_MOCK=1`, mock levels return `meta.fallback: true` to test the client's fallback state |
| `GEMINI_LIVE_ROAST` | `0` | `0` = `/api/roast` serves the canned escalating pool even if a key is set, so testing never spends quota. `1` = use Gemini (canned line on error/timeout/cap). **Keep `0` until the AI narrator is switched on** |
| `GEMINI_DAILY_CAP` | `15` | Max real Gemini requests per local day, counting repair rounds. Persisted in `server/.cache/usage.json`, resets at local midnight. When reached, live calls are skipped and fallbacks are used (logged once). `0` = unlimited |
| `GEMINI_RECORD` | `0` | `1` = save every real level/repair/roast response to `server/fixtures/` (commit them). Filenames hash the prompt, so a prompt change invalidates them |
| `GEMINI_REPLAY` | `0` | `1` = serve Gemini calls from `server/fixtures/` and never call the API; a missing fixture fails with a clear error (the endpoint still returns a fallback level) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Level generation model |
| `GEMINI_ROAST_MODEL` | `GEMINI_MODEL` | Roast model |
| `GEMINI_LEVEL_THINKING` / `GEMINI_ROAST_THINKING` | `low` | `low`, `medium` or `high` (`minimal` is rejected by the API) |
| `GEMINI_ROAST_TIMEOUT_MS` | `2500` | Server-side roast timeout. The client cutoff should be this + ~500ms |
| `PORT` | `3001` | Injected by the platform |

Level responses are also cached on disk (`server/.cache/levels/<image hash>.json`, gitignored, non-fallback results only), so a repeat scan of the same photo costs no Gemini call, even after a restart. `GET /api/usage` (not registered in production) shows today's call count against the cap.

Recommended settings:

| Situation | Settings |
| --- | --- |
| Local dev (default) | `GEMINI_MOCK=1` (zero calls, no key needed) |
| Test-key day (small quota) | `GEMINI_MOCK=0`, `GEMINI_LIVE_ROAST=0`, `GEMINI_DAILY_CAP=15`, `GEMINI_RECORD=1` so every real response is captured once; afterwards use `GEMINI_REPLAY=1` |
| Offline with recorded fixtures | `GEMINI_REPLAY=1` (with `GEMINI_LIVE_ROAST=1` to replay roasts too) |
| Prod / demo | `GEMINI_API_KEY` set, `GEMINI_MOCK=0`, `GEMINI_LIVE_ROAST=1` once the AI narrator is on (else `0`), `GEMINI_DAILY_CAP` high or `0` for unlimited, paid tier |

Camera capture needs HTTPS, so test from a phone on the deployed URL. Never commit `.env`.

## Layout

| Path | What |
| --- | --- |
| `client/src/game` | Phaser game (`mountGame`, `loadLevel`, `GameScene`) |
| `client/src/ui` | React screens |
| `server` | Express API (`/api/health`, `/api/level`, `/api/roast`) |
| `shared` | Constants, Zod level schema + `sampleLevel`, typed `gameEvents` (imported as `@sketchquest/shared`) |
| `samples` | Sample sketches |

## Later enhancement: multi-photo levels

Allow players to capture or upload several numbered sketch frames, reorder or remove them, and build a longer level by placing the frames side by side. Before implementation, align the frontend, backend, and game on the multi-image request format and how wider scrolling worlds are represented; the current level schema uses normalized `0-1000` coordinates and the game uses a fixed `1600x900` world.
