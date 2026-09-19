# Dev 1: Gemini Pipeline Task Breakdown

Owner: Gemini pipeline / backend / deploy / integration (`/server`, `/shared`).
Everything below is based on the current skeleton (stub endpoints, shared schema) plus the team build plan.

## Already done by the skeleton
- Express server, `GET /api/health`, prod static serving of `/client/dist`, Vite `/api` proxy.
- `/shared`: constants, Zod level schema (Zod 4), event types.
- Stub `POST /api/level` and `POST /api/roast` returning hardcoded data.
- `@google/genai` installed but unused. `express.json` limit is already 20mb.

## What dev 1 still has to do (priority order)

### 1. Kickoff (10 min)
- Put the Gemini API key in `.env` (never commit it).
- Confirm the current model name (docs list `gemini-3.8-flash`) and pick Interactions API vs `generateContent`. Stick with one.
- Fix contract mismatches: roast returns `{ line }` (stub returns `{ roast }`), level returns `{ level, meta: { repairs, fallback } }`.
- Agree with dev 3 where the last 3 roasts live (client sends `recentRoasts`, or server tracks them).

### 2. Real `/api/level` (blocks everyone at the 12:15 integration)
- Accept a base64 JPEG.
- One Gemini call: image + system prompt (marker legend, 0-1000 coords, coordinate convention, design rules, ignore paper edges/shadows/hands), low temperature, JSON schema output via `z.toJSONSchema(LevelSchema)`.
- Same call returns level name, intro line, and 6 fallback quips.
- Clamp and sanitize output. The client's `sanitizeLevel` should move into `/shared` so the server uses the same code.
- Always return something playable, even on Gemini error or timeout (cached fallback level).

### 3. Reachability validator (`/shared`, imports shared constants)
- Graph of platform tops, BFS from start to goal using max jump height (~131px) and max flat gap (~224px), accounting for hazards on platforms.
- Plain-English report, e.g. "gap of 240 between p3 and p4 exceeds max 224".
- Unit-test against hand-made levels.

### 4. Repair loop
- Send Gemini the photo, current JSON, and the validator report; ask for minimal edits.
- Max 2 rounds, then cached fallback with `meta.fallback: true`.
- Latency budget: first call + 2 repairs must stay near the 8s target.

### 5. Caching and fallback levels
- Cache responses by image hash (protects against rate limits and repeat demos).
- 3 hand-made fallback levels that load without Gemini.

### 6. Real `/api/roast`
- Input: level name, cause, attempt, deathsAtSpot, coins, timeAlive, last 3 roasts.
- Rules: one sentence, 20 words max, roast the play not the person, PG-13, escalate with `deathsAtSpot`.
- Fastest model tier. Server-side timeout ~1.2s so the client's 1.5s cutoff still works.

### 7. Deploy to Railway early
- Build `npm run build`, start `npm start`. Set `GEMINI_API_KEY` as an env var.
- Test from a phone over HTTPS as soon as possible (camera needs it). Do this before prompt tuning.

### 8. Prompt tuning
- Collect 10-15 photos of real drawings in `/samples` (thick markers, white paper).
- Script that runs every sample through the pipeline and prints level, reachable, repairs, latency.
- Targets: valid beatable level in under 8s, roast in under 1.5s.

### 9. Owning integration
- Merge to `main` only when the app runs. Integration checks at 12:15 and 2:00, feature freeze 2:15.
- Test with the real setup (paper, markers, phone, venue wifi; have a hotspot ready).
- Final push and deploy check at 3:00.

### 10. Add-on (only if MVP is demo-ready by 1:00)
- `/api/edit` with audio input, ops schema (`move`/`resize`/`add`/`remove`/`set`), ops applier that re-runs the validator, undo stack.

## Risks to watch
- **Coordinate convention:** platforms, hazards, goal use x,y as TOP-LEFT. Start, coins, enemies use x,y as CENTER. Put this in the Gemini system prompt explicitly or levels will be misaligned.
- **Rate limits:** the free tier may throttle during judging. Consider the paid tier ($5 minimum).
- **Latency:** vision + repairs can blow the 8s budget. Show a good loading animation and keep the image at 1280px.

## Notes
- After chunk A, tell dev 3 and dev 2 about the API shape changes; the narrator and level loader depend on them.
- Chunk B is the 12:15 blocker. If Gemini is flaky on real sketches, the fallback levels keep the demo alive while prompts get tuned.
- Deploy to Railway right after chunk A or B, not at the end.

---

# Coding-agent prompts

Give these to dev 1's coding agent one at a time, in order. Pull main first.

## Chunk A: contract fixes, sanitizer, validator (offline, no Gemini needed)

```
Read STATUS.md, shared/, and server/index.ts. Pull main first (git pull). Work in /shared and /server only.

1. Contract fixes in shared/api.ts (tell me the final shapes when done):
   - LevelResponse = { level: Level, meta: { repairs: number, fallback: boolean } }
   - RoastRequest = { levelName, cause: DeathCause, attempt, deathsAtSpot, coins, timeAlive, recentRoasts?: string[] }
   - RoastResponse = { line: string }   (was { roast })
   - LevelRequest = { image: string }   (base64 JPEG)
   Update the stub endpoints in server/index.ts to match, and anything else in the repo that references the old shapes.
2. Move the client's sanitizeLevel (client/src/game/sanitizeLevel.ts) into /shared and export it. The client imports it from shared, and the server will use the same one on Gemini output. It clamps/drops bad entities, dedupes ids, and fixes invalid hazard types instead of throwing. Keep existing behavior.
3. Add shared/validate.ts: reachability validator. Import constants from shared/constants.ts (never hardcode).
   - Derive maxJumpHeight = v^2 / (2g) and maxFlatGap from the constants (jump air time * run speed). Use a small safety margin (e.g. 90% of the max) so "beatable" isn't borderline.
   - Coordinates: platforms, hazards and goal are x,y = top-left corner. Start, coins, enemies are x,y = CENTER. Level coords are 0-1000 and the world is 1600x900; convert to world px before doing physics math.
   - BFS from the platform under `start` over platform tops: an edge exists if you can jump up (dy <= maxJumpHeight), drop down (any height), or cross horizontally (gap <= maxFlatGap, accounting for height difference). Goal is reached if a reachable platform is within jump range of the goal rect. Treat platforms that a hazard fully covers as unusable.
   - Export validateLevel(level): { reachable: boolean, report: string[] } where report lines are plain English like "gap of 240px between p3 and p4 exceeds max flat gap 224px" or "goal g1 is 210px above the highest reachable platform (max jump 131px)".
4. Add server/scripts/test-validate.ts (run with tsx) that asserts: sampleLevel is reachable, a level with an impossible gap is not reachable and the report names the platforms, a level with the goal too high is not reachable.

Verify with typecheck, build, and running the tsx test script ONLY. Do NOT run the dev server or a browser. Commit in small commits and push to main.
```

## Chunk B: real `/api/level` (Gemini vision, repair loop, cache, fallbacks)

```
Read STATUS.md, shared/, and server/index.ts. First read https://ai.google.dev/gemini-api/docs/get-started (Interactions API) to get the exact @google/genai usage for: image input as base64, structured JSON output via response_format with a JSON schema, and reading interaction.output_text. Use the model name from that page (currently gemini-3.8-flash); make it configurable via GEMINI_MODEL env with that as default. Work in /server (and /shared only if needed, tell me).

1. server/gemini.ts: thin wrapper around the client using GEMINI_API_KEY from env. Include a timeout helper.
2. server/prompts.ts + server/levelFromSketch.ts:
   - One call with the photo, low temperature, JSON schema output from z.toJSONSchema(LevelSchema) (Zod 4 has this built in).
   - System prompt must include: marker legend (black=platform, red=spikes or lava, green=goal, yellow=coins, blue circle=start, stick figure=enemy), coordinates 0-1000 with origin top-left of the photo, and the convention that platforms/hazards/goal x,y are TOP-LEFT corners while start/coins/enemies x,y are CENTERS. Design rules: start near bottom-left, goal reachable, ignore paper edges, shadows and hands, give every entity a unique id, keep platforms at least 30 units wide. Also ask for the level name, an intro line, and 6 fallback quips (PG-13, roast the level not the person).
   - Run the output through Zod parse and shared sanitizeLevel.
3. Repair loop: run validateLevel. If unreachable, send Gemini the photo + current level JSON + the validator report and ask for MINIMAL edits, returning the full corrected level. Max 2 rounds. If still unreachable or anything throws or times out, return a cached fallback level with meta.fallback = true. Total budget: aim for under 8 seconds, so use a per-call timeout (~6s for the first call, ~4s for repairs) and skip remaining repairs if the budget is spent.
4. server/fallbackLevels.ts: three hand-made fallback levels (validate each with validateLevel in the test script), pick one at random or by image hash.
5. Cache: in-memory Map keyed by sha256 of the image, storing the final response, so repeat scans are instant.
6. Wire POST /api/level: validate the body with Zod, reject a missing or oversized image with 400, and NEVER return a 500 for Gemini failures. Always return a playable level (fallback) with meta.fallback set. Log timing per stage (gemini call, each repair, total).
7. server/scripts/run-samples.ts: reads every image in /samples, runs the full pipeline, and prints per sample: level name, entity counts, reachable, repairs, fallback, ms. Works with GEMINI_API_KEY set.

Never commit .env. Verify with typecheck and build ONLY, plus running run-samples.ts if /samples has images and a key is set. Do NOT run the dev server or a browser. Commit in small commits and push to main.
```

## Chunk C: real `/api/roast` and deploy readiness

```
Read STATUS.md, shared/api.ts, and server/. Work in /server.

1. POST /api/roast: validate the body with Zod (RoastRequest from shared). Call Gemini with the fastest model tier (GEMINI_ROAST_MODEL env, default the same flash model), low latency settings, thinking off or minimal if the SDK supports it. Prompt:
   - Inputs: levelName, cause, attempt, deathsAtSpot, coins, timeAlive, recentRoasts (last 3, never repeat or paraphrase them).
   - Output: exactly one sentence, max 20 words, roast the PLAY not the person. PG-13: no slurs, no profanity, nothing about appearance, health, or background.
   - Escalation: deathsAtSpot 1 = light tease, 2 = sharper, 3+ = brutal and specific to the cause and the repeated spot. Mention the cause (spike/lava/enemy/fall) when it's funny.
2. Server-side timeout of ~1200ms (the client gives up at 1500ms). On timeout or any error, return 200 with a short generic line from a hardcoded pool keyed by cause, so the client never gets a failure. Trim the response to one sentence and strip quotes, and enforce the 20 word cap by truncating.
3. Add server/scripts/test-roast.ts that fires 5 sample death contexts (including deathsAtSpot 1, 2, 4) and prints the lines plus latency.
4. Deploy readiness for Railway: confirm the root scripts work (build = `npm run build`, start = `npm start`), PORT from env, GET /api/health, and add a "Deploy" section to README.md listing the required env vars (GEMINI_API_KEY, optional GEMINI_MODEL, GEMINI_ROAST_MODEL, NODE_ENV=production). Add basic request logging and a global error handler that returns JSON.

Verify with typecheck, build, and test-roast.ts if a key is set. Do NOT run the dev server or a browser. Update STATUS.md, commit in small commits, and push to main.
```
