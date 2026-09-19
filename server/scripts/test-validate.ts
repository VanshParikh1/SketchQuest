import assert from "node:assert/strict";
import { fallbackLevels } from "../fallbackLevels";
import {
  MAX_FLAT_GAP,
  MAX_JUMP_HEIGHT,
  LevelSchema,
  sampleLevel,
  sanitizeLevel,
  validateLevel,
  type Level,
} from "@sketchquest/shared";

/** Minimal flat level: start on p1, goal sitting on the last platform. Override pieces per test. */
function level(overrides: Partial<Level>): Level {
  return {
    name: "test",
    intro: "",
    quips: [],
    start: { x: 60, y: 880 },
    goal: { id: "g1", x: 900, y: 850, w: 40, h: 70 },
    platforms: [{ id: "p1", x: 0, y: 920, w: 1000, h: 80 }],
    hazards: [],
    coins: [],
    enemies: [],
    ...overrides,
  };
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

test("limits derive from constants (~131px jump, ~224px gap, 90% margin)", () => {
  assert.ok(Math.abs(MAX_JUMP_HEIGHT / 0.9 - 130.67) < 0.1);
  assert.ok(Math.abs(MAX_FLAT_GAP / 0.9 - 224) < 0.1);
});

test("sampleLevel is reachable", () => {
  const result = validateLevel(sampleLevel);
  assert.equal(result.reachable, true, result.report.join("\n"));
  assert.deepEqual(result.report, []);
});

test("a single ground with the goal on it is reachable", () => {
  assert.equal(validateLevel(level({})).reachable, true);
});

test("impossible gap is unreachable and names both platforms", () => {
  // 320 units = 512px between p1 and p2, far over the ~202px limit.
  const result = validateLevel(
    level({
      platforms: [
        { id: "p1", x: 0, y: 920, w: 300, h: 80 },
        { id: "p2", x: 620, y: 920, w: 380, h: 80 },
      ],
    }),
  );
  assert.equal(result.reachable, false);
  const line = result.report.find((l) => l.includes("gap"));
  assert.ok(line, result.report.join("\n"));
  assert.match(line, /p1/);
  assert.match(line, /p2/);
  assert.match(line, /exceeds max flat gap/);
});

test("gap just inside the limit is reachable", () => {
  // 120 units = 192px < ~202px.
  const result = validateLevel(
    level({
      platforms: [
        { id: "p1", x: 0, y: 920, w: 300, h: 80 },
        { id: "p2", x: 420, y: 920, w: 580, h: 80 },
      ],
    }),
  );
  assert.equal(result.reachable, true, result.report.join("\n"));
});

test("goal too high is unreachable and says so", () => {
  const result = validateLevel(level({ goal: { id: "g1", x: 900, y: 300, w: 40, h: 70 } }));
  assert.equal(result.reachable, false);
  assert.ok(result.report.some((l) => l.includes("goal g1") && l.includes("max jump height")), result.report.join("\n"));
});

test("a step taller than the max jump is unreachable and names the platforms", () => {
  const result = validateLevel(
    level({
      platforms: [
        { id: "p1", x: 0, y: 920, w: 400, h: 80 },
        { id: "p2", x: 350, y: 700, w: 300, h: 300 },
      ],
      goal: { id: "g1", x: 500, y: 630, w: 40, h: 70 },
    }),
  );
  assert.equal(result.reachable, false);
  assert.ok(result.report.some((l) => l.includes("p2") && l.includes("p1") && l.includes("max jump height")), result.report.join("\n"));
});

test("dropping down any height is fine", () => {
  const result = validateLevel(
    level({
      start: { x: 60, y: 300 },
      platforms: [
        { id: "high", x: 0, y: 340, w: 200, h: 30 },
        { id: "ground", x: 100, y: 920, w: 900, h: 80 },
      ],
      goal: { id: "g1", x: 900, y: 850, w: 40, h: 70 },
    }),
  );
  assert.equal(result.reachable, true, result.report.join("\n"));
});

test("a stair of small climbs is reachable", () => {
  const result = validateLevel(
    level({
      platforms: [
        { id: "s1", x: 0, y: 920, w: 200, h: 80 },
        { id: "s2", x: 260, y: 850, w: 200, h: 30 },
        { id: "s3", x: 520, y: 780, w: 200, h: 30 },
        { id: "s4", x: 780, y: 710, w: 200, h: 30 },
      ],
      goal: { id: "g1", x: 900, y: 640, w: 40, h: 70 },
    }),
  );
  assert.equal(result.reachable, true, result.report.join("\n"));
});

test("a platform fully covered by a spike is unusable", () => {
  const result = validateLevel(
    level({
      platforms: [
        { id: "p1", x: 0, y: 920, w: 300, h: 80 },
        { id: "p2", x: 400, y: 920, w: 600, h: 80 },
      ],
      hazards: [{ id: "h1", type: "spike", x: 400, y: 890, w: 600, h: 30 }],
    }),
  );
  assert.equal(result.reachable, false);
  assert.ok(result.report.some((l) => l.includes("p2") && l.includes("hazards")), result.report.join("\n"));
});

test("a partly covered platform is still usable", () => {
  const result = validateLevel(
    level({
      hazards: [{ id: "h1", type: "spike", x: 300, y: 890, w: 40, h: 30 }],
    }),
  );
  assert.equal(result.reachable, true, result.report.join("\n"));
});

test("start with no platform beneath it is unreachable", () => {
  const result = validateLevel(level({ start: { x: 60, y: 100 }, platforms: [{ id: "p1", x: 500, y: 920, w: 500, h: 80 }] }));
  assert.equal(result.reachable, false);
  assert.ok(result.report.some((l) => l.includes("start")));
});

test("sanitizeLevel renames duplicate ids instead of dropping entities", () => {
  const fixed = sanitizeLevel({
    goal: { id: "g", x: 1, y: 1, w: 1, h: 1 },
    platforms: [
      { id: "p", x: 0, y: 900, w: 100, h: 10 },
      { id: "p", x: 200, y: 900, w: 100, h: 10 },
      { id: "g", x: 400, y: 900, w: 100, h: 10 },
    ],
  });
  assert.deepEqual(fixed.platforms.map((p) => p.id), ["p", "p-2", "g-2"]);
});

for (const fallback of fallbackLevels) {
  test(`fallback level "${fallback.name}" is reachable and schema-valid`, () => {
    const result = validateLevel(fallback);
    assert.equal(result.reachable, true, result.report.join("\n"));
    assert.deepEqual(LevelSchema.parse(sanitizeLevel(fallback)), fallback);
    assert.equal(fallback.quips.length, 6);
  });
}

console.log(`\n${passed} tests passed`);
