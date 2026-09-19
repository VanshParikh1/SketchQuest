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

Environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Without it the API still works, but only serves fallback levels and canned roasts |
| `NODE_ENV` | yes | Set to `production` so Express serves the built client (`npm start` already sets it) |
| `GEMINI_MODEL` | no | Level generation model, default `gemini-3.8-flash` |
| `GEMINI_ROAST_MODEL` | no | Roast model, default is `GEMINI_MODEL` |
| `GEMINI_ROAST_THINKING` / `GEMINI_LEVEL_THINKING` | no | `low` (default), `medium` or `high` |
| `PORT` | no | Injected by the platform; default 3001 |

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
