import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_KEYS,
  COLLAPSE_WARNING_BEATS,
  COUNTDOWN_BEATS,
  getAttackPattern,
  getBeatMs,
  getCompletedWaveCount,
  getCountdownDurationMs,
  getImpactHoldMs,
  getNearestActiveKey,
  getNextWaveTiming,
  getPattern,
  getStage,
  getStageKeyRange,
  getStageDurationMs,
  getStageSelectionAction,
  getStageTempoRange,
  getWaveIntensity,
  getWaveProfile,
  INVULNERABILITY_MS,
  MAX_HP,
  resolveCollision,
  resolveHeal,
  resolveZoneEntry,
  getZoneTransition,
  RESTORE_WARNING_BEATS,
  STAGES,
  SURF_CYCLE_WAVES,
  SURF_FIRST_WAVE,
  SURF_SEQUENCE_WAVES,
  ZONE_PULSE_WAVES,
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
    [52, 56, 60, 64, 68, 72],
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
      assert.equal(
        Number.isInteger(section.attackBeats * 4),
        true,
        `${stage.code} ${section.name} must land on a 16th-note subdivision`,
      );
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
      assert.equal(profile.zoneTargetCount, profile.activeKeys.length);
      assert.ok(profile.activeKeys.includes("F"));
      assert.ok(profile.activeKeys.every((key) => ALL_KEYS.includes(key)));
      assert.equal(profile.isSectionStart, waveIndex === section.startWave);
      assert.ok(waveIndex >= profile.sectionStartWave);
      assert.ok(waveIndex <= profile.sectionEndWave);

      if (waveIndex === 0) {
        assert.equal(profile.zoneTransitionKind, "none");
      } else {
        const previousCount = getWaveProfile(stage, waveIndex - 1).activeKeys
          .length;
        assert.equal(
          profile.zoneTransitionKind,
          profile.activeKeys.length < previousCount
            ? "collapse"
            : profile.activeKeys.length > previousCount
              ? "restore"
              : "none",
        );
      }
    }

    assert.equal(getWaveProfile(stage, -10).waveIndex, 0);
    assert.equal(getWaveProfile(stage, 10_000).waveIndex, stage.waves - 1);
  }
});

test("uses the upcoming wave tempo for warning and impact timing", () => {
  const stage = STAGES[0];
  const previousImpactAt = 1_000;
  const profile = getWaveProfile(stage, 13);
  const timing = getNextWaveTiming(stage, 13, previousImpactAt);
  const transitionDelay = profile.beatMs * RESTORE_WARNING_BEATS;

  assert.equal(
    timing.impactAt,
    previousImpactAt +
      transitionDelay +
      profile.beatMs * profile.attackBeats,
  );
  assert.equal(timing.warningAt, timing.impactAt - profile.beatMs);
  assert.equal(timing.zoneWarningAt, previousImpactAt);
  assert.equal(timing.zoneApplyAt, previousImpactAt + transitionDelay);
  assert.ok(
    Math.abs(timing.impactAt - timing.warningAt - 60_000 / 104) < 0.001,
  );
});

test("pulses playable zones every few waves instead of only at sections", () => {
  for (const stage of STAGES) {
    const transitions = Array.from(
      { length: stage.waves },
      (_, waveIndex) => getWaveProfile(stage, waveIndex),
    ).filter((profile) => profile.zoneTransitionKind !== "none");

    assert.ok(transitions.length >= 10);
    assert.ok(transitions.some((profile) => !profile.isSectionStart));
    for (let index = 1; index < transitions.length; index += 1) {
      assert.ok(
        transitions[index].waveIndex - transitions[index - 1].waveIndex <=
          ZONE_PULSE_WAVES,
      );
    }
    assert.ok(
      transitions.some((profile) => profile.zoneTransitionKind === "collapse"),
    );
    assert.ok(
      transitions.some((profile) => profile.zoneTransitionKind === "restore"),
    );
  }
});

test("collapses only keys hit by the preceding danger pattern", () => {
  const stage = STAGES[0];
  const previousKeys = getWaveProfile(stage, 9).activeKeys;
  const desiredCount = getWaveProfile(stage, 10).zoneTargetCount;
  assert.ok(previousKeys.length > desiredCount);

  const partial = getZoneTransition(stage, 10, previousKeys, ["F", "Q"]);
  assert.equal(partial.kind, "collapse");
  assert.deepEqual(partial.collapsingKeys, ["Q"]);
  assert.deepEqual(partial.dangerDrivenKeys, ["Q"]);
  assert.ok(partial.toKeys.includes("F"));
  assert.equal(partial.toKeys.length, previousKeys.length - 1);
  assert.ok(partial.collapsingKeys.every((key) => ["F", "Q"].includes(key)));
  assert.equal(partial.warningBeats, COLLAPSE_WARNING_BEATS);

  const completed = getZoneTransition(stage, 11, partial.toKeys, ["W", "E"]);
  assert.equal(completed.kind, "collapse");
  assert.equal(completed.toKeys.length, desiredCount);
  assert.ok(completed.collapsingKeys.every((key) => ["W", "E"].includes(key)));

  const noDanger = getZoneTransition(stage, 10, previousKeys, ["F"]);
  assert.equal(noDanger.kind, "none");
  assert.deepEqual(noDanger.toKeys, previousKeys);
  assert.equal(noDanger.warningMs, 0);
});

test("warns before safely restoring keys and exposes an exact apply time", () => {
  const stage = STAGES[0];
  const previousKeys = getWaveProfile(stage, 4).activeKeys;
  const plan = getZoneTransition(stage, 5, previousKeys, []);

  assert.equal(plan.kind, "restore");
  assert.equal(plan.warningBeats, RESTORE_WARNING_BEATS);
  assert.equal(plan.restoringKeys.length, 2);
  assert.equal(plan.collapsingKeys.length, 0);
  assert.ok(plan.toKeys.includes("F"));
  assert.equal(plan.toKeys.length, getWaveProfile(stage, 5).zoneTargetCount);

  const timing = getNextWaveTiming(stage, 5, 2_000, plan);
  assert.equal(timing.zoneWarningAt, 2_000);
  assert.equal(timing.zoneApplyAt, 2_000 + plan.warningMs);
  assert.ok(timing.warningAt! >= timing.zoneApplyAt!);
});

test("keeps every stage close to two minutes including zone warnings", () => {
  const roundedDurations = STAGES.map(
    (stage) => Math.round((getStageDurationMs(stage) / 1_000) * 10) / 10,
  );
  assert.deepEqual(roundedDurations, [115.2, 114.9, 113.7, 113.4, 114.5, 114]);

  for (const stage of STAGES) {
    const durationSeconds = getStageDurationMs(stage) / 1_000;
    assert.ok(
      durationSeconds >= 113 && durationSeconds <= 117,
      `${stage.code} was ${durationSeconds.toFixed(2)} seconds`,
    );
  }
});

test("separates impact feedback from a following zone warning", () => {
  assert.equal(getImpactHoldMs(1_000), 180);
  assert.equal(getImpactHoldMs(400), 140);
  assert.equal(getImpactHoldMs(-1), 0);
});

test("finds the physically nearest active QWERTY key", () => {
  assert.equal(getNearestActiveKey("P", ["F", "G"]), "G");
  assert.equal(getNearestActiveKey("D", ["E", "S", "M"]), "S");
  assert.equal(getNearestActiveKey("Q", ["Q", "P"]), "Q");
});

test("breaks equal-distance nearest-key ties in keyboard reading order", () => {
  assert.equal(getNearestActiveKey("G", ["H", "F"]), "F");
  assert.equal(getNearestActiveKey("G", ["F", "H"]), "F");
});

test("nearest-key selection returns only valid active keys", () => {
  const activeKeys = ["F", "J", "M"];
  const nearest = getNearestActiveKey("P", activeKeys);

  assert.equal(nearest, "J");
  assert.ok(activeKeys.includes(nearest));
  assert.throws(() => getNearestActiveKey("P", []));
  assert.throws(() => getNearestActiveKey("Space", activeKeys));
});

test("keeps valid positions and moves collapsed positions to the nearest key", () => {
  assert.deepEqual(resolveZoneEntry("D", ["S", "D", "F", "G"]), {
    playerKey: "D",
    recentered: false,
  });
  assert.deepEqual(resolveZoneEntry("P", ["S", "D", "F", "G"]), {
    playerKey: "G",
    recentered: true,
  });
  assert.throws(() => resolveZoneEntry("A", ["A", "S", "D"]));
});

test("resolves a collapsed danger cell into the nearest surviving active key", () => {
  const stage = STAGES[0];
  const previousKeys = getWaveProfile(stage, 9).activeKeys;
  const transition = getZoneTransition(stage, 10, previousKeys, ["Q"]);

  assert.deepEqual(transition.collapsingKeys, ["Q"]);
  const resolution = resolveZoneEntry("Q", transition.toKeys);
  assert.equal(resolution.recentered, true);
  assert.equal(resolution.playerKey, "W");
  assert.ok(transition.toKeys.includes(resolution.playerKey));
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

test("builds attacks from the runtime zone after a collapse or restore", () => {
  const stage = STAGES[3];
  const runtimeKeys = ["W", "E", "R", "A", "S", "D", "F", "G"];

  for (let waveIndex = 0; waveIndex < stage.waves; waveIndex += 1) {
    const pattern = getAttackPattern(waveIndex, stage, runtimeKeys);
    assert.ok(pattern.targets.every((key) => runtimeKeys.includes(key)));
    if (pattern.kind === "standard") {
      assert.ok(pattern.targets.length <= runtimeKeys.length - 2);
    }
    if (pattern.kind === "last-safe") {
      assert.equal(pattern.targets.length, runtimeKeys.length - 1);
      assert.ok(pattern.safeKey && runtimeKeys.includes(pattern.safeKey));
    }
    if (pattern.kind === "heal") {
      assert.ok(pattern.healKey && runtimeKeys.includes(pattern.healKey));
    }
  }
});

test("sweeps a surf crest across three successive standard waves", () => {
  const stage = STAGES[1];
  const homeRow = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const horizontalCenter = (keys: readonly string[]) =>
    keys.reduce((sum, key) => sum + homeRow.indexOf(key), 0) / keys.length;

  const leftToRight = [5, 6, 7].map((waveIndex) =>
    getAttackPattern(waveIndex, stage, homeRow),
  );
  assert.deepEqual(
    leftToRight.map((pattern) => pattern.surf),
    [
      {
        direction: "left-to-right",
        step: 0,
        totalSteps: 3,
        leftPercent: 2.5,
        widthPercent: 30,
      },
      {
        direction: "left-to-right",
        step: 1,
        totalSteps: 3,
        leftPercent: 32.5,
        widthPercent: 30,
      },
      {
        direction: "left-to-right",
        step: 2,
        totalSteps: 3,
        leftPercent: 62.5,
        widthPercent: 30,
      },
    ],
  );
  assert.ok(
    horizontalCenter(leftToRight[0].targets) <
      horizontalCenter(leftToRight[1].targets),
  );
  assert.ok(
    horizontalCenter(leftToRight[1].targets) <
      horizontalCenter(leftToRight[2].targets),
  );

  const rightToLeft = [18, 19, 20].map((waveIndex) =>
    getAttackPattern(waveIndex, stage, homeRow),
  );
  assert.deepEqual(
    rightToLeft.map((pattern) => pattern.surf?.direction),
    ["right-to-left", "right-to-left", "right-to-left"],
  );
  assert.ok(
    horizontalCenter(rightToLeft[0].targets) >
      horizontalCenter(rightToLeft[1].targets),
  );
  assert.ok(
    horizontalCenter(rightToLeft[1].targets) >
      horizontalCenter(rightToLeft[2].targets),
  );
});

test("keeps surf attacks inside changing runtime zones with two safe keys", () => {
  const runtimeZones = [
    ["A", "S", "D", "F", "G"],
    ["W", "E", "R", "A", "S", "D", "F", "G"],
    ["Q", "W", "E", "R", "T", "A", "S", "D", "F", "G", "H"],
  ];

  for (const [step, runtimeKeys] of runtimeZones.entries()) {
    const pattern = getAttackPattern(5 + step, STAGES[0], runtimeKeys);
    assert.equal(pattern.kind, "standard");
    assert.equal(pattern.surf?.step, step);
    assert.ok(pattern.targets.length > 0);
    assert.ok(pattern.targets.length <= runtimeKeys.length - 2);
    assert.ok(pattern.targets.every((key) => runtimeKeys.includes(key)));
    assert.ok(pattern.surf && pattern.surf.leftPercent >= 0);
    assert.ok(pattern.surf && pattern.surf.widthPercent >= 10);
    assert.ok(
      pattern.surf &&
        pattern.surf.leftPercent + pattern.surf.widthPercent <= 100,
    );
  }
});

test("makes complete surf runs noticeable without dominating a stage", () => {
  assert.equal(SURF_FIRST_WAVE, 5);
  assert.equal(SURF_CYCLE_WAVES, 13);
  assert.equal(SURF_SEQUENCE_WAVES, 3);

  for (const stage of STAGES) {
    const patterns = Array.from({ length: stage.waves }, (_, waveIndex) =>
      getAttackPattern(waveIndex, stage),
    );
    const surfPatterns = patterns.filter((pattern) => pattern.surf !== null);
    const surfRatio = surfPatterns.length / stage.waves;

    assert.ok(surfRatio >= 0.2 && surfRatio <= 0.25);
    assert.equal(surfPatterns.length % SURF_SEQUENCE_WAVES, 0);
    for (let waveIndex = 0; waveIndex < stage.waves; waveIndex += 1) {
      if (patterns[waveIndex].surf?.step !== 0) continue;
      assert.deepEqual(
        patterns
          .slice(waveIndex, waveIndex + SURF_SEQUENCE_WAVES)
          .map((pattern) => pattern.surf?.step),
        [0, 1, 2],
      );
    }
  }
});

test("adds rare one-safe-key attacks only from the middle stages", () => {
  assert.equal(getAttackPattern(10, STAGES[0]).kind, "standard");
  assert.equal(getAttackPattern(10, STAGES[1]).kind, "standard");

  for (const stage of STAGES.slice(2)) {
    const profile = getWaveProfile(stage, 10);
    const pattern = getAttackPattern(10, stage);
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
    assert.ok(lastSafeCount >= 2 && lastSafeCount <= 4);
  }
});

test("schedules one rare heal wave on a key active in that wave", () => {
  assert.equal(
    Array.from({ length: STAGES[0].waves }, (_, index) =>
      getAttackPattern(index, STAGES[0]),
    ).filter((candidate) => candidate.kind === "heal").length,
    0,
  );
  assert.equal(
    Array.from({ length: STAGES[1].waves }, (_, index) =>
      getAttackPattern(index, STAGES[1]),
    ).filter((candidate) => candidate.kind === "heal").length,
    0,
  );

  for (const stage of STAGES.slice(2)) {
    const healWaveIndex = Math.floor(stage.waves * 0.58);
    const profile = getWaveProfile(stage, healWaveIndex);
    const pattern = getAttackPattern(healWaveIndex, stage);
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
  assert.equal(getWaveIntensity(STAGES[0], STAGES[0].waves - 1), 2);
  assert.equal(getWaveIntensity(STAGES[2], 38), 2);
  assert.equal(getWaveIntensity(STAGES[2], 39), 3);
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
