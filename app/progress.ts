import {
  getAttackPattern,
  getStage,
  MAX_HP,
  STAGES,
  type StageConfig,
  type StageId,
} from "./gameLogic.ts";

export const PROGRESS_STORAGE_KEY = "keyboard-dodge.progress.v1";
export const PROGRESS_SCHEMA_VERSION = 1 as const;
export const RANK_VERSION = 1 as const;

const MAX_STORED_RUNS = 999_999;
const MAX_STORED_SCORE = 999_999_999;
const RECENT_RUN_ID_LIMIT = 32;

export type RunOutcome = "cleared" | "game-over";
export type Grade = "S" | "A" | "B" | "C" | "D";

export interface RunResult {
  runId: string;
  stageId: StageId;
  outcome: RunOutcome;
  completedWaves: number;
  score: number;
  bestCombo: number;
  remainingHp: number;
  endedAt: number;
}

export interface RankedRun extends RunResult {
  grade: Grade;
  rating: number;
  parScore: number;
  perfectCombo: number;
}

export interface StageProgress {
  attempts: number;
  clears: number;
  bestCompletedWaves: number;
  bestScore: number;
  bestCombo: number;
  bestClearHp: number | null;
  bestRating: number;
  bestGrade: Grade | null;
  lastPlayedAt: number | null;
}

export interface LocalProgressV1 {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  rankVersion: typeof RANK_VERSION;
  lastRunId: string | null;
  recentRunIds: string[];
  stages: Record<StageId, StageProgress>;
}

export interface NewBestFlags {
  firstClear: boolean;
  grade: boolean;
  score: boolean;
  combo: boolean;
  hp: boolean;
  waves: boolean;
}

export interface RunCommitResult {
  progress: LocalProgressV1;
  rankedRun: RankedRun;
  newBests: NewBestFlags;
  duplicate: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createEmptyStageProgress(): StageProgress {
  return {
    attempts: 0,
    clears: 0,
    bestCompletedWaves: 0,
    bestScore: 0,
    bestCombo: 0,
    bestClearHp: null,
    bestRating: 0,
    bestGrade: null,
    lastPlayedAt: null,
  };
}

export function createEmptyProgress(): LocalProgressV1 {
  const stages = {} as Record<StageId, StageProgress>;

  for (const stage of STAGES) {
    stages[stage.id] = createEmptyStageProgress();
  }

  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    rankVersion: RANK_VERSION,
    lastRunId: null,
    recentRunIds: [],
    stages,
  };
}

export function getPerfectCombo(stage: StageConfig) {
  let combo = 0;

  for (let waveIndex = 0; waveIndex < stage.waves; waveIndex += 1) {
    if (getAttackPattern(waveIndex, stage).kind !== "heal") combo += 1;
  }

  return combo;
}

export function getPerfectRunScore(stage: StageConfig) {
  let score = 0;
  let streak = 0;

  for (let waveIndex = 0; waveIndex < stage.waves; waveIndex += 1) {
    const pattern = getAttackPattern(waveIndex, stage);

    if (pattern.kind === "heal") {
      // A damage-free run reaches the heal wave at full HP.
      score += 150;
      continue;
    }

    streak += 1;
    score +=
      (pattern.kind === "last-safe" ? 220 : 100) +
      Math.min(streak, 20) * 10;
  }

  return score + MAX_HP * 300 + stage.id * 500;
}

function clampInteger(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRunId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 128);
  return normalized.length > 0 ? normalized : null;
}

function isGrade(value: unknown): value is Grade {
  return value === "S" || value === "A" || value === "B" || value === "C" || value === "D";
}

function getGrade(rating: number): Grade {
  if (rating >= 95) return "S";
  if (rating >= 85) return "A";
  if (rating >= 70) return "B";
  if (rating >= 50) return "C";
  return "D";
}

const GRADE_ORDER: Readonly<Record<Grade, number>> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

export function evaluateRun(run: RunResult): RankedRun {
  const runId = normalizeRunId(run.runId);
  if (!runId) throw new Error("A run result requires a non-empty runId");
  if (run.outcome !== "cleared" && run.outcome !== "game-over") {
    throw new Error("Unknown run outcome");
  }

  const stage = getStage(run.stageId);
  const parScore = getPerfectRunScore(stage);
  const perfectCombo = getPerfectCombo(stage);
  const completedWaves = clampInteger(run.completedWaves, 0, stage.waves);
  const score = clampInteger(run.score, 0, MAX_STORED_SCORE);
  const bestCombo = clampInteger(run.bestCombo, 0, stage.waves);
  const remainingHp = clampInteger(run.remainingHp, 0, MAX_HP);
  const endedAt = clampInteger(run.endedAt, 0, Number.MAX_SAFE_INTEGER);
  const completionRatio = completedWaves / stage.waves;
  const scoreRatio = clampRatio(score / parScore);
  const comboRatio = perfectCombo > 0
    ? clampRatio(bestCombo / perfectCombo)
    : 0;
  const hpRatio = remainingHp / MAX_HP;
  let rating = Math.round(
    completionRatio * 45 +
      scoreRatio * 30 +
      comboRatio * 15 +
      hpRatio * 10,
  );

  if (run.outcome === "game-over") rating = Math.min(79, rating);

  return {
    ...run,
    runId,
    completedWaves,
    score,
    bestCombo,
    remainingHp,
    endedAt,
    grade: getGrade(rating),
    rating,
    parScore,
    perfectCombo,
  };
}

function noNewBests(): NewBestFlags {
  return {
    firstClear: false,
    grade: false,
    score: false,
    combo: false,
    hp: false,
    waves: false,
  };
}

function isBetterGrade(run: RankedRun, previous: StageProgress) {
  if (previous.bestGrade === null) return true;
  const runOrder = GRADE_ORDER[run.grade];
  const previousOrder = GRADE_ORDER[previous.bestGrade];
  return runOrder > previousOrder ||
    (runOrder === previousOrder && run.rating > previous.bestRating);
}

export function applyRunResult(
  progress: LocalProgressV1,
  run: RunResult,
): RunCommitResult {
  const rankedRun = evaluateRun(run);
  const alreadyRecorded =
    progress.lastRunId === rankedRun.runId ||
    progress.recentRunIds.includes(rankedRun.runId);

  if (alreadyRecorded) {
    return {
      progress,
      rankedRun,
      newBests: noNewBests(),
      duplicate: true,
    };
  }

  const previous = progress.stages[rankedRun.stageId] ?? createEmptyStageProgress();
  const cleared = rankedRun.outcome === "cleared";
  const gradeImproved = isBetterGrade(rankedRun, previous);
  const newBests: NewBestFlags = {
    firstClear: cleared && previous.clears === 0,
    grade: gradeImproved,
    score: rankedRun.score > previous.bestScore,
    combo: rankedRun.bestCombo > previous.bestCombo,
    hp:
      cleared &&
      (previous.bestClearHp === null ||
        rankedRun.remainingHp > previous.bestClearHp),
    waves: rankedRun.completedWaves > previous.bestCompletedWaves,
  };
  const nextStageProgress: StageProgress = {
    attempts: Math.min(MAX_STORED_RUNS, previous.attempts + 1),
    clears: Math.min(
      MAX_STORED_RUNS,
      previous.clears + (cleared ? 1 : 0),
    ),
    bestCompletedWaves: Math.max(
      previous.bestCompletedWaves,
      rankedRun.completedWaves,
    ),
    bestScore: Math.max(previous.bestScore, rankedRun.score),
    bestCombo: Math.max(previous.bestCombo, rankedRun.bestCombo),
    bestClearHp: cleared
      ? Math.max(previous.bestClearHp ?? 0, rankedRun.remainingHp)
      : previous.bestClearHp,
    bestRating: gradeImproved ? rankedRun.rating : previous.bestRating,
    bestGrade: gradeImproved ? rankedRun.grade : previous.bestGrade,
    lastPlayedAt: rankedRun.endedAt,
  };
  const recentRunIds = [
    ...progress.recentRunIds.filter((runId) => runId !== rankedRun.runId),
    rankedRun.runId,
  ].slice(-RECENT_RUN_ID_LIMIT);

  return {
    progress: {
      ...progress,
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      rankVersion: RANK_VERSION,
      lastRunId: rankedRun.runId,
      recentRunIds,
      stages: {
        ...progress.stages,
        [rankedRun.stageId]: nextStageProgress,
      },
    },
    rankedRun,
    newBests,
    duplicate: false,
  };
}

function sanitizeStageProgress(value: unknown, stage: StageConfig): StageProgress {
  if (!isRecord(value)) return createEmptyStageProgress();

  const attempts = clampInteger(value.attempts, 0, MAX_STORED_RUNS);
  if (attempts === 0) return createEmptyStageProgress();

  const clears = clampInteger(value.clears, 0, attempts);
  const rawClearHp = value.bestClearHp;
  const bestClearHp = clears > 0 && typeof rawClearHp === "number"
    ? clampInteger(rawClearHp, 0, MAX_HP)
    : null;
  const bestGrade = isGrade(value.bestGrade) ? value.bestGrade : null;
  const rawLastPlayedAt = value.lastPlayedAt;
  const lastPlayedAt = typeof rawLastPlayedAt === "number" && Number.isFinite(rawLastPlayedAt)
    ? clampInteger(rawLastPlayedAt, 0, Number.MAX_SAFE_INTEGER)
    : null;

  return {
    attempts,
    clears,
    bestCompletedWaves: clampInteger(
      value.bestCompletedWaves,
      0,
      stage.waves,
    ),
    bestScore: clampInteger(value.bestScore, 0, MAX_STORED_SCORE),
    bestCombo: clampInteger(value.bestCombo, 0, getPerfectCombo(stage)),
    bestClearHp,
    bestRating: clampInteger(value.bestRating, 0, 100),
    bestGrade,
    lastPlayedAt,
  };
}

function sanitizeProgress(value: unknown): LocalProgressV1 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== PROGRESS_SCHEMA_VERSION ||
    value.rankVersion !== RANK_VERSION
  ) {
    return createEmptyProgress();
  }

  const stages = {} as Record<StageId, StageProgress>;
  const rawStages = isRecord(value.stages) ? value.stages : {};

  for (const stage of STAGES) {
    stages[stage.id] = sanitizeStageProgress(rawStages[String(stage.id)], stage);
  }

  const lastRunId = normalizeRunId(value.lastRunId);
  const recentRunIds = Array.isArray(value.recentRunIds)
    ? [...new Set(value.recentRunIds.map(normalizeRunId).filter(
        (runId): runId is string => runId !== null,
      ))].slice(-RECENT_RUN_ID_LIMIT)
    : lastRunId
      ? [lastRunId]
      : [];

  if (lastRunId && !recentRunIds.includes(lastRunId)) {
    recentRunIds.push(lastRunId);
    if (recentRunIds.length > RECENT_RUN_ID_LIMIT) recentRunIds.shift();
  }

  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    rankVersion: RANK_VERSION,
    lastRunId,
    recentRunIds,
    stages,
  };
}

export function parseProgress(raw: string | null): LocalProgressV1 {
  if (raw === null) return createEmptyProgress();

  try {
    return sanitizeProgress(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyProgress();
  }
}

export function loadProgress(storage: StorageLike): LocalProgressV1 {
  try {
    return parseProgress(storage.getItem(PROGRESS_STORAGE_KEY));
  } catch {
    return createEmptyProgress();
  }
}

export function saveProgress(
  storage: StorageLike,
  progress: LocalProgressV1,
) {
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
