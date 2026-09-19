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
