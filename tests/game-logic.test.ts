import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_KEYS,
  COUNTDOWN_BEATS,
  getAttackPattern,
  getBeatMs,
  getCompletedWaveCount,
  getCountdownDurationMs,
  getNextWaveTiming,
  getPattern,
  getStage,
  getStageKeyRange,
  getStageSelectionAction,
  getStageTempoRange,
  getWaveIntensity,
  getWaveProfile,
  INVULNERABILITY_MS,
  MAX_HP,
  resolveCollision,
  resolveHeal,
  resolveZoneEntry,
  STAGES,
} from "../app/gameLogic.ts";

test("defines every alphabet key exactly once", () => {
  assert.equal(ALL_KEYS.length, 26);
  assert.equal(new Set(ALL_KEYS).size, 26);
  assert.deepEqual([...ALL_KEYS].sort(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
});

test("defines six contiguous keyboard-selectable stages", () => {
  assert.equal(COUNTDOWN_BEATS, 3);
  assert.deepEqual(
    STAGES.map((stage) => stage.id),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    STAGES.map((stage) => stage.selectKey),
    ["Q", "W", "E", "R", "T", "Y"],
  );
  assert.deepEqual(
    STAGES.map((stage) => stage.waves),
    [12, 14, 16, 18, 21, 24],
  );
  assert.deepEqual(
    STAGES.map((stage) => getWaveProfile(stage, 0).bpm),
    [92, 100, 108, 116, 124, 132],
  );
  assert.equal(
    new Set(STAGES.map((stage) => stage.selectKey)).size,
    STAGES.length,
  );

  for (const stage of STAGES) {
    assert.equal(getStage(stage.id), stage);
    assert.equal(stage.sections[0].startWave, 0);
    assert.ok(stage.code.startsWith("STAGE"));
    assert.ok(stage.name.length > 0);
    assert.ok(stage.description.length > 0);
    assert.equal(getBeatMs(stage), 60_000 / stage.sections[0].bpm);
    assert.equal(
      getCountdownDurationMs(stage),
      getBeatMs(stage, 0) * COUNTDOWN_BEATS,
    );

    for (let index = 1; index < stage.sections.length; index += 1) {
      assert.ok(
        stage.sections[index - 1].startWave < stage.sections[index].startWave,
      );
    }
    assert.ok(stage.sections.at(-1)!.startWave < stage.waves);
  }
});

test("varies tempo and playable key zones inside every stage", () => {
  const expectedTempoRanges = [
    { min: 82, max: 110 },
    { min: 88, max: 122 },
    { min: 94, max: 132 },
    { min: 102, max: 142 },
    { min: 108, max: 150 },
    { min: 116, max: 156 },
  ];
  const expectedKeyRanges = [
    { min: 5, max: 11 },
    { min: 8, max: 15 },
    { min: 10, max: 19 },
    { min: 12, max: 22 },
    { min: 15, max: 25 },
    { min: 18, max: 26 },
  ];

  for (const [stageIndex, stage] of STAGES.entries()) {
    assert.equal(stage.sections.length, 4);
    assert.deepEqual(getStageTempoRange(stage), expectedTempoRanges[stageIndex]);
    assert.deepEqual(getStageKeyRange(stage), expectedKeyRanges[stageIndex]);

    const tempos = stage.sections.map((section) => section.bpm);
    const keyCounts = stage.sections.map(
      (section) => section.activeKeys.length,
    );
    assert.ok(tempos[1] > tempos[0]);
    assert.ok(tempos[2] < tempos[1]);
    assert.ok(tempos[3] > tempos[2]);
    assert.ok(keyCounts[1] > keyCounts[0]);
    assert.ok(keyCounts[2] < keyCounts[1]);
    assert.ok(keyCounts[3] > keyCounts[2]);

    for (const section of stage.sections) {
      assert.ok(section.activeKeys.includes("F"));
      assert.equal(new Set(section.activeKeys).size, section.activeKeys.length);
      assert.ok(section.activeKeys.every((key) => ALL_KEYS.includes(key)));
    }
  }
});

test("resolves every wave to its deterministic section profile", () => {
  for (const stage of STAGES) {
    for (let waveIndex = 0; waveIndex < stage.waves; waveIndex += 1) {
      const profile = getWaveProfile(stage, waveIndex);
      const section = stage.sections[profile.sectionIndex];
      assert.equal(profile.waveIndex, waveIndex);
      assert.equal(profile.sectionName, section.name);
      assert.equal(profile.sectionStartWave, section.startWave);
      assert.equal(profile.bpm, section.bpm);
      assert.equal(profile.beatMs, 60_000 / section.bpm);
      assert.equal(getBeatMs(stage, waveIndex), profile.beatMs);
      assert.equal(profile.attackBeats, section.attackBeats);
      assert.equal(profile.activeKeys, section.activeKeys);
      assert.equal(profile.isSectionStart, waveIndex === section.startWave);
      assert.ok(waveIndex >= profile.sectionStartWave);
      assert.ok(waveIndex <= profile.sectionEndWave);
    }

    assert.equal(getWaveProfile(stage, -10).waveIndex, 0);
    assert.equal(getWaveProfile(stage, 10_000).waveIndex, stage.waves - 1);
  }
});

test("uses the upcoming wave tempo for warning and impact timing", () => {
  const stage = STAGES[0];
  const previousImpactAt = 1_000;
  const profile = getWaveProfile(stage, 3);
  const timing = getNextWaveTiming(stage, 3, previousImpactAt);

  assert.equal(
    timing.impactAt,
    previousImpactAt + profile.beatMs * profile.attackBeats,
  );
  assert.equal(timing.warningAt, timing.impactAt - profile.beatMs);
  assert.equal(timing.impactAt - timing.warningAt, 60_000 / 104);
});

test("keeps valid positions and recenters contracted zones to F", () => {
  assert.deepEqual(resolveZoneEntry("D", ["S", "D", "F", "G"]), {
    playerKey: "D",
    recentered: false,
  });
  assert.deepEqual(resolveZoneEntry("P", ["S", "D", "F", "G"]), {
    playerKey: "F",
    recentered: true,
  });
  assert.throws(() => resolveZoneEntry("A", ["A", "S", "D"]));
});

test("requires the same stage input twice to start", () => {
  assert.equal(getStageSelectionAction(null, 1), "focus");
  assert.equal(getStageSelectionAction(1, 1), "start");
  assert.equal(getStageSelectionAction(1, 6), "focus");
  assert.equal(getStageSelectionAction(6, 6), "start");
});

test("every standard attack targets its current key zone and leaves safety", () => {
  for (const stage of STAGES) {
    for (let waveIndex = 0; waveIndex < stage.waves; waveIndex += 1) {
      const profile = getWaveProfile(stage, waveIndex);
      const pattern = getAttackPattern(waveIndex, stage);

      if (pattern.kind === "standard") {
        assert.ok(pattern.targets.length > 0);
        assert.ok(pattern.targets.length <= profile.activeKeys.length - 2);
        assert.equal(new Set(pattern.targets).size, pattern.targets.length);
        assert.ok(
          pattern.targets.every((key) => profile.activeKeys.includes(key)),
        );
      }
    }

    for (const section of stage.sections) {
      for (let intensity = 1; intensity <= 3; intensity += 1) {
        for (let index = 0; index < 24; index += 1) {
          const targets = getPattern(index, intensity, section.activeKeys);
          assert.ok(targets.length > 0);
          assert.ok(targets.length <= section.activeKeys.length - 2);
          assert.equal(new Set(targets).size, targets.length);
          assert.ok(targets.every((key) => section.activeKeys.includes(key)));
        }
      }
    }
  }
});

test("adds rare one-safe-key attacks only from the middle stages", () => {
  assert.equal(getAttackPattern(8, STAGES[0]).kind, "standard");
  assert.equal(getAttackPattern(8, STAGES[1]).kind, "standard");

  for (const stage of STAGES.slice(2)) {
    const profile = getWaveProfile(stage, 8);
    const pattern = getAttackPattern(8, stage);
    assert.equal(pattern.kind, "last-safe");
    assert.ok(pattern.safeKey);
    assert.equal(pattern.targets.length, profile.activeKeys.length - 1);
    assert.ok(pattern.targets.every((key) => profile.activeKeys.includes(key)));
    assert.deepEqual(
      profile.activeKeys.filter((key) => !pattern.targets.includes(key)),
      [pattern.safeKey],
    );

    const lastSafeCount = Array.from({ length: stage.waves }, (_, index) =>
      getAttackPattern(index, stage),
    ).filter((candidate) => candidate.kind === "last-safe").length;
    assert.ok(lastSafeCount >= 1 && lastSafeCount <= 2);
  }
});

test("schedules one rare heal wave on a key active in that wave", () => {
  assert.notEqual(getAttackPattern(11, STAGES[0]).kind, "heal");
  assert.notEqual(getAttackPattern(11, STAGES[1]).kind, "heal");

  for (const stage of STAGES.slice(2)) {
    const profile = getWaveProfile(stage, 11);
    const pattern = getAttackPattern(11, stage);
    assert.equal(pattern.kind, "heal");
    assert.deepEqual(pattern.targets, []);
    assert.ok(pattern.healKey);
    assert.ok(profile.activeKeys.includes(pattern.healKey));

    const healCount = Array.from({ length: stage.waves }, (_, index) =>
      getAttackPattern(index, stage),
    ).filter((candidate) => candidate.kind === "heal").length;
    assert.equal(healCount, 1);
  }
});

test("heals only after a matching input during the warning and caps HP", () => {
  const tooEarly = resolveHeal("J", "J", { key: "J", at: 999 }, 1_000, 3);
  assert.equal(tooEarly.qualified, false);
  assert.equal(tooEarly.hp, 3);

  const wrongKey = resolveHeal("J", "J", { key: "H", at: 1_100 }, 1_000, 3);
  assert.equal(wrongKey.qualified, false);
  assert.equal(wrongKey.hp, 3);

  const healed = resolveHeal("J", "J", { key: "J", at: 1_100 }, 1_000, 3);
  assert.equal(healed.qualified, true);
  assert.equal(healed.healed, true);
  assert.equal(healed.hp, 4);

  const full = resolveHeal(
    "J",
    "J",
    { key: "J", at: 1_100 },
    1_000,
    MAX_HP,
  );
  assert.equal(full.qualified, true);
  assert.equal(full.healed, false);
  assert.equal(full.full, true);
  assert.equal(full.hp, MAX_HP);
});

test("raises each stage intensity near the final third", () => {
  assert.equal(getWaveIntensity(STAGES[0], 0), 1);
  assert.equal(getWaveIntensity(STAGES[0], 11), 2);
  assert.equal(getWaveIntensity(STAGES[2], 9), 2);
  assert.equal(getWaveIntensity(STAGES[2], 10), 3);
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

test("does not count a fatal wave as completed", () => {
  assert.equal(getCompletedWaveCount(0, true), 0);
  assert.equal(getCompletedWaveCount(23, true), 23);
  assert.equal(getCompletedWaveCount(23, false), 24);
});
