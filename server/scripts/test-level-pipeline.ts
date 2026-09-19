import assert from "node:assert/strict";
import { sampleLevel, validateLevel, type Level } from "@sketchquest/shared";
import { levelFromSketch, type Generate } from "../levelFromSketch";
import { parseSketchImage } from "../sketchImage";

// Offline: Gemini is replaced by scripted responses, so this needs no key or network.

const unreachable: Level = {
  ...sampleLevel,
  platforms: [
    { id: "p1", x: 0, y: 920, w: 300, h: 80 },
    { id: "p2", x: 620, y: 920, w: 380, h: 80 },
  ],
  hazards: [],
  enemies: [],
  goal: { id: "goal", x: 900, y: 850, w: 40, h: 70 },
};

function scripted(...replies: (Level | string | Error)[]): { gen: Generate; calls: () => number } {
  let n = 0;
  const gen: Generate = async () => {
    const reply = replies[Math.min(n++, replies.length - 1)]!;
    if (reply instanceof Error) throw reply;
    return typeof reply === "string" ? reply : JSON.stringify(reply);
  };
  return { gen, calls: () => n };
}

let seed = 0;
/** Unique image per test so the cache never leaks between them. */
const image = () => ({ data: Buffer.from(`sketch-${seed++}`).toString("base64"), mimeType: "image/jpeg" });

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

await test("a beatable first response is returned as-is", async () => {
  const s = scripted(sampleLevel);
  const { level, meta } = await levelFromSketch(image(), { generate: s.gen });
  assert.deepEqual(meta, { repairs: 0, fallback: false });
  assert.equal(level.name, sampleLevel.name);
  assert.equal(s.calls(), 1);
});

await test("an unreachable level is repaired in one round", async () => {
  const s = scripted(unreachable, sampleLevel);
  const { meta } = await levelFromSketch(image(), { generate: s.gen });
  assert.deepEqual(meta, { repairs: 1, fallback: false });
  assert.equal(s.calls(), 2);
});

await test("still unreachable after 2 repairs falls back", async () => {
  const s = scripted(unreachable);
  const { level, meta } = await levelFromSketch(image(), { generate: s.gen });
  assert.equal(meta.fallback, true);
  assert.equal(s.calls(), 3);
  assert.equal(validateLevel(level).reachable, true);
});

await test("a throwing model falls back without throwing", async () => {
  const { level, meta } = await levelFromSketch(image(), { generate: scripted(new Error("boom")).gen });
  assert.equal(meta.fallback, true);
  assert.equal(validateLevel(level).reachable, true);
});

await test("non-JSON model output falls back", async () => {
  const { meta } = await levelFromSketch(image(), { generate: scripted("sorry, I can't").gen });
  assert.equal(meta.fallback, true);
});

await test("a failing repair call falls back", async () => {
  const { meta } = await levelFromSketch(image(), { generate: scripted(unreachable, new Error("timeout")).gen });
  assert.equal(meta.fallback, true);
});

await test("malformed-but-parseable output is sanitized, not rejected", async () => {
  const messy = { ...sampleLevel, platforms: [...sampleLevel.platforms, { id: "bad" }, { x: 1 }], coins: [{ x: 5 }] };
  const { meta } = await levelFromSketch(image(), { generate: scripted(JSON.stringify(messy)).gen });
  assert.equal(meta.fallback, false);
});

await test("repeat scans hit the cache; fallbacks are not cached", async () => {
  const img = image();
  const s = scripted(sampleLevel);
  await levelFromSketch(img, { generate: s.gen });
  const again = await levelFromSketch(img, { generate: s.gen });
  assert.equal(s.calls(), 1);
  assert.equal(again.meta.fallback, false);

  const bad = image();
  const b = scripted(new Error("down"));
  await levelFromSketch(bad, { generate: b.gen });
  await levelFromSketch(bad, { generate: b.gen });
  assert.equal(b.calls(), 2);
});

await test("concurrent identical scans share one pipeline run", async () => {
  const img = image();
  const s = scripted(sampleLevel);
  await Promise.all([levelFromSketch(img, { generate: s.gen }), levelFromSketch(img, { generate: s.gen })]);
  assert.equal(s.calls(), 1);
});

await test("image parsing: data URL, raw base64, and rejects", () => {
  assert.deepEqual(parseSketchImage("data:image/jpeg;base64,QUJD"), { ok: true, image: { data: "QUJD", mimeType: "image/jpeg" } });
  assert.deepEqual(parseSketchImage("QUJD"), { ok: true, image: { data: "QUJD", mimeType: "image/jpeg" } });
  assert.equal(parseSketchImage("").ok, false);
  assert.equal(parseSketchImage("data:text/html;base64,QUJD").ok, false);
  assert.equal(parseSketchImage("not base64!!").ok, false);
  assert.equal(parseSketchImage("A".repeat(12_000_001)).ok, false);
});

console.log(`\n${passed} tests passed`);
