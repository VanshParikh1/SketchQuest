# Sketchquest

Hand-drawn sketch → Gemini → playable Phaser platformer. (Hackathon project.)

## Run

```bash
cp .env.example .env   # add GEMINI_API_KEY (unused for now)
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

## Layout

| Path | What |
| --- | --- |
| `client/src/game` | Phaser game (`mountGame`, `loadLevel`, `GameScene`) |
| `client/src/ui` | React screens |
| `server` | Express API (`/api/health`, stub `/api/level`, stub `/api/roast`) |
| `shared` | Constants, Zod level schema + `sampleLevel`, typed `gameEvents` (imported as `@sketchquest/shared`) |
| `samples` | Sample sketches |

## Later enhancement: multi-photo levels

Allow players to capture or upload several numbered sketch frames, reorder or remove them, and build a longer level by placing the frames side by side. Before implementation, align the frontend, backend, and game on the multi-image request format and how wider scrolling worlds are represented; the current level schema uses normalized `0-1000` coordinates and the game uses a fixed `1600x900` world.
