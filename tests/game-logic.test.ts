import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_KEYS,
  getIntensity,
  getPattern,
  INVULNERABILITY_MS,
  resolveCollision,
} from "../app/gameLogic.ts";

test("defines every alphabet key exactly once", () => {
  assert.equal(ALL_KEYS.length, 26);
  assert.equal(new Set(ALL_KEYS).size, 26);
  assert.deepEqual([...ALL_KEYS].sort(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
});

test("every generated attack leaves at least one safe key", () => {
  for (let intensity = 1; intensity <= 3; intensity += 1) {
    for (let index = 0; index < 100; index += 1) {
      for (const player of ALL_KEYS) {
        const targets = getPattern(index, player, intensity);
        assert.ok(targets.length > 0);
        assert.ok(targets.length < ALL_KEYS.length);
        assert.equal(new Set(targets).size, targets.length);
      }
    }
  }
});

test("raises intensity across the three 15-second sections", () => {
  assert.equal(getIntensity(45_000), 1);
  assert.equal(getIntensity(29_999), 2);
  assert.equal(getIntensity(14_999), 3);
});

test("blocks repeat damage during the 500ms invulnerability window", () => {
  const first = resolveCollision(["F"], "F", 1_000, 0);
  assert.equal(first.damaged, true);
  assert.equal(first.invulnerableUntil, 1_000 + INVULNERABILITY_MS);

  const repeated = resolveCollision(
    ["F"],
    "F",
    1_499,
    first.invulnerableUntil,
  );
  assert.equal(repeated.inDanger, true);
  assert.equal(repeated.damaged, false);

  const safe = resolveCollision(["J"], "F", 2_000, repeated.invulnerableUntil);
  assert.equal(safe.inDanger, false);
  assert.equal(safe.damaged, false);
});
