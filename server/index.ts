import "./env";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import {
  LevelRequestSchema,
  RoastRequestSchema,
  type HealthResponse,
  type LevelResponse,
  type RoastResponse,
} from "@sketchquest/shared";
import { usageSnapshot } from "./budget";
import { dailyCap, isLiveRoast, isRecord, isReplay, mode } from "./config";
import { hasGeminiKey } from "./gemini";
import { serveLevel, serveRoast } from "./serve";
import { parseSketchImage } from "./sketchImage";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_DIST = path.resolve(import.meta.dirname, "../client/dist");

const app = express();

// Request log: one line per /api call (method, path, status, ms). Bodies are never logged.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const started = Date.now();
  res.on("finish", () => {
    console.log(`[http] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});

app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  // Only the mode: never the key or anything derived from it.
  res.json({ ok: true, mode: mode() } satisfies HealthResponse);
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
  res.json((await serveLevel(parsed.image)) satisfies LevelResponse);
});

// Death context -> one roast line. Always 200 for a valid body: a slow or failing
// model yields a generic line for the cause instead of an error.
app.post("/api/roast", async (req, res) => {
  const body = RoastRequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Body must be a RoastRequest" });
    return;
  }
  res.json((await serveRoast(body.data)) satisfies RoastResponse);
});

// Dev-only: today's real-call count against GEMINI_DAILY_CAP. Not registered in production.
if (process.env.NODE_ENV !== "production") {
  app.get("/api/usage", (_req, res) => {
    res.json({
      ...usageSnapshot(),
      mode: mode(),
      liveRoast: isLiveRoast(),
      record: isRecord(),
      replay: isReplay(),
      keyConfigured: hasGeminiKey(),
    });
  });
}

// Unknown /api routes get JSON, not the SPA fallback or an HTML 404.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Production: one service serves the built client.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

// Global error handler: always JSON (body-parse failures, oversized bodies, bugs).
const onError: ErrorRequestHandler = (err, req, res, _next) => {
  const status =
    typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}`, err);
  if (res.headersSent) return;
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.type === "entity.too.large" ? "Request body too large" : "Bad request",
  });
};
app.use(onError);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  const cap = dailyCap();
  console.log(
    `[server] mode=${mode()} liveRoast=${isLiveRoast()} dailyCap=${cap || "unlimited"} record=${isRecord()} replay=${isReplay()} key=${hasGeminiKey() ? "set" : "missing"}`
  );
});
