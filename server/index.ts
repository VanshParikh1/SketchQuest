import "./env";
import path from "node:path";
import express from "express";
import {
  LevelRequestSchema,
  type HealthResponse,
  type LevelResponse,
  type RoastResponse,
} from "@sketchquest/shared";
import { levelFromSketch } from "./levelFromSketch";
import { parseSketchImage } from "./sketchImage";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_DIST = path.resolve(import.meta.dirname, "../client/dist");

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true } satisfies HealthResponse);
});

// Sketch photo -> playable level. Gemini failures never surface as errors: the
// response is always a playable level, with meta.fallback set when it's a stand-in.
app.post("/api/level", async (req, res) => {
  const body = LevelRequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Body must be { image: string } (base64 JPEG)" });
    return;
  }
  const parsed = parseSketchImage(body.data.image);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json((await levelFromSketch(parsed.image)) satisfies LevelResponse);
});

// Stub: will take death/win events and return a Gemini-generated roast.
app.post("/api/roast", (_req, res) => {
  res.json({ line: "You died to a doodle. A DOODLE." } satisfies RoastResponse);
});

// Production: one service serves the built client.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
