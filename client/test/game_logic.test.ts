import { describe, it } from "node:test";
import assert from "node:assert";
import { DeathTracker } from "../src/game/DeathTracker.ts";
import {
  gameEvents,
  sampleLevel,
  LevelSchema,
  type DeathEvent,
} from "@sketchquest/shared";

describe("DeathTracker System", () => {
  it("increments attempt counter per death", () => {
    const tracker = new DeathTracker(80);
    assert.strictEqual(tracker.getAttempt(), 1);

    const d1 = tracker.recordDeath("spike", 100, 200, 2);
    assert.strictEqual(d1.attempt, 1);
    assert.strictEqual(d1.cause, "spike");
    assert.strictEqual(d1.coins, 2);
    assert.strictEqual(d1.deathsAtSpot, 1);
    assert.strictEqual(tracker.getAttempt(), 2);

    const d2 = tracker.recordDeath("lava", 500, 500, 3);
    assert.strictEqual(d2.attempt, 2);
    assert.strictEqual(d2.cause, "lava");
    assert.strictEqual(d2.coins, 3);
    assert.strictEqual(d2.deathsAtSpot, 1);
    assert.strictEqual(tracker.getAttempt(), 3);
  });

  it("detects repeat deaths at the same spot within proximity radius", () => {
    const tracker = new DeathTracker(80);

    // First death at (200, 300)
    const d1 = tracker.recordDeath("spike", 200, 300, 0);
    assert.strictEqual(d1.deathsAtSpot, 1);

    // Second death nearby at (220, 310) -> distance ~ 22.36px <= 80px
    const d2 = tracker.recordDeath("spike", 220, 310, 0);
    assert.strictEqual(d2.deathsAtSpot, 2);

    // Third death nearby at (190, 290) -> distance ~ 14.14px <= 80px
    const d3 = tracker.recordDeath("spike", 190, 290, 1);
    assert.strictEqual(d3.deathsAtSpot, 3);

    // Fourth death far away at (800, 100) -> new spot!
    const d4 = tracker.recordDeath("enemy", 800, 100, 1);
    assert.strictEqual(d4.deathsAtSpot, 1);
  });

  it("calculates timeAlive as a positive number and resets properly", () => {
    const tracker = new DeathTracker(80);
    const d1 = tracker.recordDeath("fall", 50, 950, 0);
    assert.ok(d1.timeAlive >= 0.1);

    tracker.reset();
    assert.strictEqual(tracker.getAttempt(), 1);
    const d2 = tracker.recordDeath("fall", 50, 950, 0);
    assert.strictEqual(d2.attempt, 1);
    assert.strictEqual(d2.deathsAtSpot, 1);
  });
});

describe("Game Events Bridge", () => {
  it("emits and receives typed death events", () => {
    const received: DeathEvent[] = [];
    const unsubscribe = gameEvents.on("death", (event) => {
      received.push(event);
    });

    const testEvent: DeathEvent = {
      cause: "spike",
      x: 120,
      y: 840,
      attempt: 3,
      deathsAtSpot: 2,
      coins: 4,
      timeAlive: 8.5,
    };

    gameEvents.emit("death", testEvent);
    assert.strictEqual(received.length, 1);
    assert.deepStrictEqual(received[0], testEvent);

    unsubscribe();
    gameEvents.emit("death", testEvent);
    assert.strictEqual(received.length, 1); // no extra delivery after unsubscribe
  });

  it("emits and receives win events", () => {
    let won = false;
    const unsub = gameEvents.on("win", () => {
      won = true;
    });

    gameEvents.emit("win");
    assert.strictEqual(won, true);
    unsub();
  });
});

describe("Level Schema Verification", () => {
  it("validates sampleLevel against LevelSchema", () => {
    const parsed = LevelSchema.parse(sampleLevel);
    assert.strictEqual(parsed.name, "Doodle Dash");
    assert.ok(parsed.platforms.length > 0);
    assert.ok(parsed.hazards.length > 0);
    assert.ok(parsed.coins.length > 0);
    assert.ok(parsed.enemies.length > 0);
  });
});
