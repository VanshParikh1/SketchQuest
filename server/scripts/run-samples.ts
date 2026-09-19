import fs from "node:fs";
import path from "node:path";
import "../env";
import { validateLevel } from "@sketchquest/shared";
import { levelFromSketch } from "../levelFromSketch";
import { hasGeminiKey } from "../gemini";

const SAMPLES_DIR = path.resolve(import.meta.dirname, "../../samples");
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const files = fs.existsSync(SAMPLES_DIR)
  ? fs.readdirSync(SAMPLES_DIR).filter((f) => path.extname(f).toLowerCase() in MIME).sort()
  : [];

if (files.length === 0) {
  console.log(`No images in ${SAMPLES_DIR}. Add .jpg/.png/.webp sketches and rerun.`);
  process.exit(0);
}
if (!hasGeminiKey()) {
  console.warn("GEMINI_API_KEY is not set: every sample will use a fallback level.\n");
}

type Row = Record<string, string | number | boolean>;
const rows: Row[] = [];

for (const file of files) {
  const data = fs.readFileSync(path.join(SAMPLES_DIR, file)).toString("base64");
  const started = Date.now();
  const { level, meta } = await levelFromSketch(
    { data, mimeType: MIME[path.extname(file).toLowerCase()]! },
    { cache: false }
  );
  rows.push({
    sample: file,
    level: level.name,
    "plat/haz/coin/enemy": [level.platforms, level.hazards, level.coins, level.enemies].map((l) => l.length).join("/"),
    reachable: validateLevel(level).reachable,
    repairs: meta.repairs,
    fallback: meta.fallback,
    ms: Date.now() - started,
  });
}

console.table(rows);
const ms = rows.map((r) => r.ms as number);
console.log(
  `${rows.filter((r) => !r.fallback).length}/${rows.length} real levels, ` +
    `avg ${Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)}ms, max ${Math.max(...ms)}ms`
);
