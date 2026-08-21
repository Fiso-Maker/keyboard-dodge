import assert from "node:assert/strict";
import test from "node:test";
import { MAX_HP, STAGES, type StageId } from "../app/gameLogic.ts";
import {
  applyRunResult,
  createEmptyProgress,
  evaluateRun,
  getPerfectCombo,
  getPerfectRunScore,
  loadProgress,
  parseProgress,
  PROGRESS_STORAGE_KEY,
  saveProgress,
  type RunResult,
  type StorageLike,
} from "../app/progress.ts";

function perfectRun(stageId: StageId, runId = `perfect-${stageId}`): RunResult {
  const stage = STAGES[stageId - 1];
  return {
    runId,
    stageId,
    outcome: "cleared",
    completedWaves: stage.waves,
    score: getPerfectRunScore(stage),
    bestCombo: getPerfectCombo(stage),
    remainingHp: MAX_HP,
    endedAt: 1_700_000_000_000 + stageId,
  };
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("creates independent empty records for all six always-available stages", () => {
  const progress = createEmptyProgress();
  assert.deepEqual(Object.keys(progress.stages), ["1", "2", "3", "4", "5", "6"]);
  assert.equal(progress.lastRunId, null);
  assert.deepEqual(progress.recentRunIds, []);

  progress.stages[1].attempts = 9;
  assert.equal(progress.stages[2].attempts, 0);
});

test("keeps perfect-score and combo baselines aligned with game scoring", () => {
  assert.deepEqual(STAGES.map(getPerfectRunScore), [
    15_700,
    17_400,
    19_310,
    21_010,
    22_830,
    24_530,
  ]);
  assert.deepEqual(STAGES.map(getPerfectCombo), [52, 56, 59, 63, 67, 71]);
});

test("awards an S and rating 100 to a perfect clear of every stage", () => {
  for (const stage of STAGES) {
    const ranked = evaluateRun(perfectRun(stage.id));
    assert.equal(ranked.rating, 100);
    assert.equal(ranked.grade, "S");
    assert.equal(ranked.parScore, getPerfectRunScore(stage));
    assert.equal(ranked.perfectCombo, getPerfectCombo(stage));
  }
});

test("caps a game-over result below A even near the end of a stage", () => {
  const stage = STAGES[5];
  const ranked = evaluateRun({
    ...perfectRun(stage.id, "late-failure"),
    outcome: "game-over",
    completedWaves: stage.waves - 1,
    remainingHp: 0,
  });

  assert.equal(ranked.rating, 79);
  assert.equal(ranked.grade, "B");
});

test("records a first clear and reports each independent new best", () => {
  const initial = createEmptyProgress();
  const run = perfectRun(1, "first-clear");
  const committed = applyRunResult(initial, run);
  const stage = committed.progress.stages[1];

  assert.equal(committed.duplicate, false);
  assert.deepEqual(committed.newBests, {
    firstClear: true,
    grade: true,
    score: true,
    combo: true,
    hp: true,
    waves: true,
  });
  assert.equal(stage.attempts, 1);
  assert.equal(stage.clears, 1);
  assert.equal(stage.bestScore, run.score);
  assert.equal(stage.bestCombo, run.bestCombo);
  assert.equal(stage.bestClearHp, MAX_HP);
  assert.equal(stage.bestGrade, "S");
});

test("does not let a worse later run overwrite stage bests", () => {
  const first = applyRunResult(
    createEmptyProgress(),
    perfectRun(2, "best-run"),
  );
  const worseRun: RunResult = {
    runId: "worse-run",
    stageId: 2,
    outcome: "game-over",
    completedWaves: 20,
    score: 2_000,
    bestCombo: 8,
    remainingHp: 0,
    endedAt: 1_800_000_000_000,
  };
  const second = applyRunResult(first.progress, worseRun);
  const stage = second.progress.stages[2];

  assert.deepEqual(second.newBests, {
    firstClear: false,
    grade: false,
    score: false,
    combo: false,
    hp: false,
    waves: false,
  });
  assert.equal(stage.attempts, 2);
  assert.equal(stage.clears, 1);
  assert.equal(stage.bestScore, first.progress.stages[2].bestScore);
  assert.equal(stage.bestGrade, "S");
  assert.equal(stage.lastPlayedAt, worseRun.endedAt);
});

test("ignores a repeated run id, including after another result", () => {
  const original = perfectRun(3, "shared-run-id");
  const first = applyRunResult(createEmptyProgress(), original);
  const intervening = applyRunResult(
    first.progress,
    perfectRun(4, "intervening-run"),
  );
  const duplicate = applyRunResult(intervening.progress, original);

  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.progress, intervening.progress);
  assert.equal(duplicate.progress.stages[3].attempts, 1);
  assert.deepEqual(duplicate.newBests, {
    firstClear: false,
    grade: false,
    score: false,
    combo: false,
    hp: false,
    waves: false,
  });
});

test("falls back for malformed or incompatible persisted data", () => {
  assert.deepEqual(parseProgress("not-json"), createEmptyProgress());
  assert.deepEqual(
    parseProgress(JSON.stringify({ schemaVersion: 9, rankVersion: 1 })),
    createEmptyProgress(),
  );
  assert.deepEqual(
    parseProgress(JSON.stringify({ schemaVersion: 1, rankVersion: 9 })),
    createEmptyProgress(),
  );
});

test("sanitizes persisted numbers, grades, ids, and missing stages", () => {
  const parsed = parseProgress(JSON.stringify({
    schemaVersion: 1,
    rankVersion: 1,
    lastRunId: "  last-run  ",
    recentRunIds: [" duplicate ", "duplicate", 42, ""],
    stages: {
      1: {
        attempts: 2.9,
        clears: 50,
        bestCompletedWaves: 500,
        bestScore: -4,
        bestCombo: 500,
        bestClearHp: 80,
        bestRating: 500,
        bestGrade: "Z",
        lastPlayedAt: -10,
      },
    },
  }));

  assert.equal(parsed.lastRunId, "last-run");
  assert.deepEqual(parsed.recentRunIds, ["duplicate", "last-run"]);
  assert.deepEqual(parsed.stages[1], {
    attempts: 2,
    clears: 2,
    bestCompletedWaves: STAGES[0].waves,
    bestScore: 0,
    bestCombo: getPerfectCombo(STAGES[0]),
    bestClearHp: MAX_HP,
    bestRating: 100,
    bestGrade: null,
    lastPlayedAt: 0,
  });
  assert.deepEqual(parsed.stages[6], createEmptyProgress().stages[6]);
});

test("round-trips storage and remains safe when storage throws", () => {
  const storage = new MemoryStorage();
  const progress = applyRunResult(
    createEmptyProgress(),
    perfectRun(5, "stored-run"),
  ).progress;

  assert.equal(saveProgress(storage, progress), true);
  assert.ok(storage.values.has(PROGRESS_STORAGE_KEY));
  assert.deepEqual(loadProgress(storage), progress);

  const throwingStorage: StorageLike = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.deepEqual(loadProgress(throwingStorage), createEmptyProgress());
  assert.equal(saveProgress(throwingStorage, progress), false);
});
