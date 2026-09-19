import path from "node:path";
import express from "express";
import dotenv from "dotenv";
import { sampleLevel, type HealthResponse, type LevelResponse, type RoastResponse } from "@sketchquest/shared";

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env"), quiet: true });

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_DIST = path.resolve(import.meta.dirname, "../client/dist");

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true } satisfies HealthResponse);
});

// Stub: will take a sketch image and return a Gemini-generated level.
app.post("/api/level", (_req, res) => {
  res.json({ level: sampleLevel, meta: { repairs: 0, fallback: true } } satisfies LevelResponse);
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
