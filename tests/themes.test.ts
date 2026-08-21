import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THEME_ID,
  getTheme,
  THEMES,
} from "../app/themes.ts";

const EXPECTED_THEME_IDS = [
  "polar-white",
  "warm-white",
  "mono-signal",
  "signal-blue",
  "amber-ops",
  "ivory-lab",
] as const;

const EXPECTED_THEME_NAMES = [
  "Polar White",
  "Warm White",
  "Mono Signal",
  "Signal Blue",
  "Amber Ops",
  "Ivory Lab",
] as const;

test("defines the six interface themes in their intended order", () => {
  assert.deepEqual(
    THEMES.map((theme) => theme.id),
    EXPECTED_THEME_IDS,
  );
  assert.deepEqual(
    THEMES.map((theme) => theme.displayName),
    EXPECTED_THEME_NAMES,
  );
});

test("uses unique theme ids and five valid hex swatches per theme", () => {
  const ids = THEMES.map((theme) => theme.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const theme of THEMES) {
    assert.equal(theme.swatches.length, 5, `${theme.id} swatch count`);
    for (const swatch of theme.swatches) {
      assert.match(swatch, /^#[0-9a-f]{6}$/i, `${theme.id} ${swatch}`);
    }
  }
});

test("defaults to Polar White and falls back to it for unknown ids", () => {
  assert.equal(DEFAULT_THEME_ID, "polar-white");
  assert.equal(getTheme(DEFAULT_THEME_ID), THEMES[0]);
  assert.equal(getTheme("not-a-theme"), THEMES[0]);
  assert.equal(getTheme(null), THEMES[0]);
  assert.equal(getTheme(undefined), THEMES[0]);
});

test("resolves every valid theme id to its matching configuration", () => {
  for (const theme of THEMES) {
    assert.equal(getTheme(theme.id), theme);
  }
});
