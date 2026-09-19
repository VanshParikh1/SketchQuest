import "./offline-env";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sampleLevel, validateLevel, type Level, type RoastRequest } from "@sketchquest/shared";
import { BudgetExceededError, reserveCall, usageSnapshot } from "../budget";
import { CANNED_ROASTS, roastLine } from "../roast";
import { fallbackLevels } from "../fallbackLevels";
import { fixtureKey, FixtureMissError, saveFixture } from "../fixtures";
import { generate, type InputPart } from "../gemini";
import { imageHash, clearMemoryCache, levelFromSketch, type Generate } from "../levelFromSketch";
import { resetMockRotation } from "../mock";
import { serveLevel, serveRoast } from "../serve";
import { parseSketchImage } from "../sketchImage";

// Offline: Gemini is replaced by scripted responses or fixtures, so this needs no key or network.
// (offline-env.ts swaps in a fake key and temp dirs before anything else loads.)

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

// ---------------------------------------------------------------------------
// Spend controls: mock mode, disk cache, daily cap, record/replay, live-roast gate
// ---------------------------------------------------------------------------

/** Runs `fn` with env vars set (undefined deletes), then restores them. */
async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

const tempDir = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `sq-${name}-`));
const roastReq = (over: Partial<RoastRequest> = {}): RoastRequest => ({
  levelName: "Doodle Dash", cause: "spike", attempt: 1, deathsAtSpot: 1, coins: 0, timeAlive: 3, ...over,
});
const inTier = (cause: RoastRequest["cause"], tier: number, line: string) => CANNED_ROASTS[cause][tier]!.includes(line);

await test("mock level: 2-4s fake latency, rotating hand-made levels, meta.fallback false", async () => {
  await withEnv({ GEMINI_MOCK: "1", GEMINI_MOCK_FALLBACK: undefined }, async () => {
    resetMockRotation();
    const delays: number[] = [];
    const names: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await serveLevel(image(), { sleep: async (ms) => void delays.push(ms) });
      assert.deepEqual(r.meta, { repairs: 0, fallback: false });
      assert.equal(validateLevel(r.level).reachable, true);
      names.push(r.level.name);
    }
    assert.ok(delays.every((d) => d >= 2000 && d <= 4000), delays.join(","));
    assert.deepEqual(names, [...fallbackLevels.map((l) => l.name), sampleLevel.name, fallbackLevels[0]!.name]);
    assert.ok(new Set(delays).size > 1, "latency should be random");
  });
});

await test("mock level with GEMINI_MOCK_FALLBACK=1 reports meta.fallback true", async () => {
  await withEnv({ GEMINI_MOCK: "1", GEMINI_MOCK_FALLBACK: "1" }, async () => {
    const r = await serveLevel(image(), { sleep: async () => {} });
    assert.deepEqual(r.meta, { repairs: 0, fallback: true });
  });
});

await test("mock roast: 300-1200ms, escalates with deathsAtSpot, never repeats recentRoasts", async () => {
  await withEnv({ GEMINI_MOCK: "1" }, async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => void delays.push(ms);
    for (const cause of ["spike", "lava", "enemy", "fall"] as const) {
      assert.ok(inTier(cause, 0, (await serveRoast(roastReq({ cause, deathsAtSpot: 1 }), { sleep })).line));
      assert.ok(inTier(cause, 1, (await serveRoast(roastReq({ cause, deathsAtSpot: 2 }), { sleep })).line));
      assert.ok(inTier(cause, 2, (await serveRoast(roastReq({ cause, deathsAtSpot: 4 }), { sleep })).line));
    }
    assert.ok(delays.every((d) => d >= 300 && d <= 1200), delays.join(","));

    const recent: string[] = [];
    for (let i = 0; i < 25; i++) {
      const { line } = await serveRoast(roastReq({ deathsAtSpot: 1 + (i % 4), recentRoasts: recent.slice(-3) }), { sleep });
      assert.ok(!recent.slice(-3).includes(line), `repeated ${line}`);
      recent.push(line);
    }
  });
});

await test("GEMINI_LIVE_ROAST=0 serves canned lines even when the model could answer; =1 uses it", async () => {
  await withEnv({ GEMINI_REPLAY: "1", GEMINI_LIVE_ROAST: undefined }, async () => {
    const req = roastReq({ levelName: "live-roast-gate" });
    // Record what the model "said" for this exact request; only the live path can return it.
    await roastLine(req, async (options) => {
      const text = "A fixture-only line about that spike.";
      saveFixture(options, text);
      return text;
    });
    const gated = await serveRoast(req);
    assert.ok(inTier("spike", 0, gated.line), `expected a canned line, got: ${gated.line}`);

    process.env.GEMINI_LIVE_ROAST = "1";
    assert.equal((await serveRoast(req)).line, "A fixture-only line about that spike.");
  });
});

await test("disk cache: a repeat scan after a restart costs zero calls; fallbacks are never cached", async () => {
  const img = image();
  const good = scripted(sampleLevel);
  const first = await levelFromSketch(img, { generate: good.gen });
  assert.equal(first.meta.fallback, false);
  assert.ok(fs.existsSync(path.join(process.env.SKETCHQUEST_CACHE_DIR!, "levels", `${imageHash(img)}.json`)));

  clearMemoryCache(); // "restart": memory is gone, the disk file is not
  const dead = scripted(new Error("must not be called"));
  const again = await levelFromSketch(img, { generate: dead.gen });
  assert.equal(dead.calls(), 0);
  assert.equal(again.meta.fallback, false);
  assert.equal(again.level.name, sampleLevel.name);

  const bad = image();
  const down = scripted(new Error("down"));
  assert.equal((await levelFromSketch(bad, { generate: down.gen })).meta.fallback, true);
  assert.ok(!fs.existsSync(path.join(process.env.SKETCHQUEST_CACHE_DIR!, "levels", `${imageHash(bad)}.json`)));

  const corrupt = image();
  const dir = path.join(process.env.SKETCHQUEST_CACHE_DIR!, "levels");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${imageHash(corrupt)}.json`), "{not json");
  const recovering = scripted(sampleLevel);
  assert.equal((await levelFromSketch(corrupt, { generate: recovering.gen })).meta.fallback, false);
  assert.equal(recovering.calls(), 1);

  const bypass = scripted(sampleLevel);
  await levelFromSketch(img, { generate: bypass.gen, cache: false });
  assert.equal(bypass.calls(), 1);
});

await test("daily cap: counts persist, the cap blocks (logged once), 0 = unlimited, new day resets", async () => {
  await withEnv({ SKETCHQUEST_CACHE_DIR: tempDir("cap"), GEMINI_DAILY_CAP: "2" }, async () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
    try {
      assert.equal(reserveCall("a"), 1);
      assert.equal(reserveCall("b"), 2);
      for (let i = 0; i < 3; i++) assert.throws(() => reserveCall("c"), BudgetExceededError);
      assert.equal(warnings.filter((w) => w.includes("daily cap reached")).length, 1, warnings.join("|"));
    } finally {
      console.warn = realWarn;
    }
    assert.deepEqual(usageSnapshot(), { ...usageSnapshot(), count: 2, cap: 2, remaining: 0 });

    process.env.GEMINI_DAILY_CAP = "0";
    assert.equal(reserveCall("unlimited"), 3);
    assert.equal(usageSnapshot().remaining, null);

    fs.writeFileSync(path.join(process.env.SKETCHQUEST_CACHE_DIR!, "usage.json"), JSON.stringify({ date: "2000-01-01", count: 99 }));
    assert.equal(usageSnapshot().count, 0);
  });
});

await test("daily cap reached: real generate() refuses before any request and both pipelines fall back", async () => {
  await withEnv({ SKETCHQUEST_CACHE_DIR: tempDir("capgen"), GEMINI_DAILY_CAP: "1", GEMINI_REPLAY: undefined }, async () => {
    reserveCall("used up"); // 1/1 spent, so every later call must be refused before touching the network
    await assert.rejects(
      generate({ label: "level", system: "s", input: "i", timeoutMs: 1000 }),
      BudgetExceededError,
    );
    const level = await levelFromSketch(image()); // default generate
    assert.equal(level.meta.fallback, true);
    assert.equal(validateLevel(level.level).reachable, true);
    const roast = await roastLine(roastReq());
    assert.equal(roast.source, "fallback");
    assert.match(roast.reason ?? "", /cap/i);
    assert.equal(usageSnapshot().count, 1, "refused calls must not be counted");
  });
});

await test("replay: recorded level and repair calls serve the whole pipeline with no API call", async () => {
  await withEnv({ SKETCHQUEST_FIXTURES_DIR: tempDir("fix"), GEMINI_REPLAY: undefined }, async () => {
    const img = image();
    const script = [unreachable, sampleLevel];
    let n = 0;
    // Record: a scripted "model" whose raw answers are saved exactly as GEMINI_RECORD would.
    const recorded = await levelFromSketch(img, {
      cache: false,
      generate: async (options) => {
        const text = JSON.stringify(script[n++]);
        saveFixture(options, text);
        return text;
      },
    });
    assert.equal(recorded.meta.repairs, 1);

    process.env.GEMINI_REPLAY = "1";
    delete process.env.GEMINI_API_KEY; // replay must not need a key
    try {
      const replayed = await levelFromSketch(img, { cache: false }); // default generate = fixtures only
      assert.deepEqual(replayed.meta, { repairs: 1, fallback: false });
      assert.equal(replayed.level.name, sampleLevel.name);
    } finally {
      process.env.GEMINI_API_KEY = "offline-test-key-not-real";
    }
  });
});

await test("replay miss errors clearly, never calls the API, and the pipeline degrades to a fallback", async () => {
  await withEnv({ SKETCHQUEST_FIXTURES_DIR: tempDir("miss"), GEMINI_REPLAY: "1", SKETCHQUEST_CACHE_DIR: tempDir("missusage") }, async () => {
    await assert.rejects(
      generate({ label: "level", system: "s", input: "never recorded", timeoutMs: 1000 }),
      (error: unknown) =>
        error instanceof FixtureMissError &&
        /no recorded fixture/.test(error.message) &&
        /GEMINI_RECORD=1/.test(error.message) &&
        /No API call was made/.test(error.message),
    );
    const r = await levelFromSketch(image(), { cache: false });
    assert.equal(r.meta.fallback, true);
    assert.equal(usageSnapshot().count, 0, "replay must never count as a real call");
  });
});

await test("fixture names change when the prompt changes, and the image is hashed not stored", () => {
  const text: InputPart = { type: "text", text: "go" };
  const base = { label: "level", system: "prompt v1", input: [text, { type: "image", data: "QUJD", mime_type: "image/jpeg" }] as InputPart[] };
  const a = fixtureKey(base);
  assert.notEqual(a.file, fixtureKey({ ...base, system: "prompt v2" }).file);
  assert.notEqual(a.file, fixtureKey({ ...base, input: [text, { type: "image", data: "REVG", mime_type: "image/jpeg" }] }).file);
  assert.match(a.file, /^level-[0-9a-f]{8}-[0-9a-f]{12}\.json$/);
  assert.equal(fixtureKey({ ...base, label: "repair 2" }).kind, "repair");
});

console.log(`\n${passed} tests passed`);
