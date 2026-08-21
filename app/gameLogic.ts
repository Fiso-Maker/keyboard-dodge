export const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
] as const;

export const ALL_KEYS: readonly string[] = KEY_ROWS.flat();
const KEY_ROW_OFFSETS = [0, 0.25, 0.75] as const;
const KEY_COORDINATES: ReadonlyMap<string, { x: number; y: number }> = new Map(
  KEY_ROWS.flatMap((row, rowIndex) =>
    row.map(
      (key, columnIndex) =>
        [
          key,
          { x: columnIndex + KEY_ROW_OFFSETS[rowIndex], y: rowIndex },
        ] as const,
    ),
  ),
);
export const MAX_HP = 5;
export const INVULNERABILITY_MS = 500;
export const COUNTDOWN_BEATS = 3;
export const ZONE_PULSE_WAVES = 5;
export const COLLAPSE_WARNING_BEATS = 1.5;
export const RESTORE_WARNING_BEATS = 1.25;
export const SURF_FIRST_WAVE = 5;
export const SURF_CYCLE_WAVES = 13;
export const SURF_SEQUENCE_WAVES = 3;

export type StageId = 1 | 2 | 3 | 4 | 5 | 6;
export type StageSelectKey = "Q" | "W" | "E" | "R" | "T" | "Y";
export type AttackKind = "standard" | "last-safe" | "heal";
export type ZoneTransitionKind = "none" | "collapse" | "restore";
export type SurfDirection = "left-to-right" | "right-to-left";

export interface StageSection {
  startWave: number;
  name: string;
  bpm: number;
  activeKeys: readonly string[];
  attackBeats: number;
}

export interface StageConfig {
  id: StageId;
  selectKey: StageSelectKey;
  code: string;
  name: string;
  koreanName: string;
  description: string;
  waves: number;
  sections: readonly StageSection[];
  startingIntensity: number;
  maxIntensity: number;
  lastSafeEnabled: boolean;
  healEnabled: boolean;
}

export interface WaveProfile {
  waveIndex: number;
  sectionIndex: number;
  sectionName: string;
  sectionStartWave: number;
  sectionEndWave: number;
  bpm: number;
  beatMs: number;
  attackBeats: number;
  activeKeys: readonly string[];
  isSectionStart: boolean;
  zoneTargetCount: number;
  zoneTransitionKind: ZoneTransitionKind;
}

export interface StageRange {
  min: number;
  max: number;
}

export interface WaveTiming {
  warningAt: number;
  impactAt: number;
  zoneWarningAt: number | null;
  zoneApplyAt: number | null;
}

export interface ZoneTransitionPlan {
  kind: ZoneTransitionKind;
  waveIndex: number;
  triggerAfterWaveIndex: number | null;
  warningBeats: number;
  warningMs: number;
  fromKeys: readonly string[];
  toKeys: readonly string[];
  collapsingKeys: readonly string[];
  restoringKeys: readonly string[];
  dangerDrivenKeys: readonly string[];
}

export interface ZoneEntryResolution {
  playerKey: string;
  recentered: boolean;
}

export interface AttackPattern {
  kind: AttackKind;
  targets: string[];
  safeKey: string | null;
  healKey: string | null;
  surf: SurfPattern | null;
}

export interface SurfPattern {
  direction: SurfDirection;
  step: number;
  totalSteps: number;
  leftPercent: number;
  widthPercent: number;
}

export interface InputSnapshot {
  key: string;
  at: number;
}

function keysFrom(selection: string) {
  const selected = new Set(selection.split(""));
  return ALL_KEYS.filter((key) => selected.has(key));
}

export const STAGES: readonly StageConfig[] = [
  {
    id: 1,
    selectKey: "Q",
    code: "STAGE 01",
    name: "HOME PULSE",
    koreanName: "홈 펄스",
    description: "작은 홈 영역이 박자에 따라 열리고 다시 좁아집니다.",
    waves: 52,
    sections: [
      {
        startWave: 0,
        name: "CORE",
        bpm: 92,
        activeKeys: keysFrom("SDFGH"),
        attackBeats: 3.25,
      },
      {
        startWave: 13,
        name: "OPEN STEP",
        bpm: 104,
        activeKeys: keysFrom("ASDFGHJKL"),
        attackBeats: 3,
      },
      {
        startWave: 26,
        name: "BREATH",
        bpm: 82,
        activeKeys: keysFrom("SDFGHJ"),
        attackBeats: 3.5,
      },
      {
        startWave: 39,
        name: "FINAL REACH",
        bpm: 110,
        activeKeys: keysFrom("WERTSDFGHJK"),
        attackBeats: 2.75,
      },
    ],
    startingIntensity: 1,
    maxIntensity: 2,
    lastSafeEnabled: false,
    healEnabled: false,
  },
  {
    id: 2,
    selectKey: "W",
    code: "STAGE 02",
    name: "SHIFTING GRID",
    koreanName: "시프팅 그리드",
    description: "두 줄을 오가며 확장과 수축, 템포 브레이크를 익힙니다.",
    waves: 56,
    sections: [
      {
        startWave: 0,
        name: "INNER GRID",
        bpm: 100,
        activeKeys: keysFrom("ASDFGHJK"),
        attackBeats: 3.5,
      },
      {
        startWave: 14,
        name: "TOP OPEN",
        bpm: 116,
        activeKeys: keysFrom("WERTYASDFGHJK"),
        attackBeats: 3,
      },
      {
        startWave: 28,
        name: "LOW TIDE",
        bpm: 88,
        activeKeys: keysFrom("SDFGHJKCV"),
        attackBeats: 3.75,
      },
      {
        startWave: 42,
        name: "WIDE RETURN",
        bpm: 122,
        activeKeys: keysFrom("QWERTYASDFGHJKL"),
        attackBeats: 2.75,
      },
    ],
    startingIntensity: 1,
    maxIntensity: 3,
    lastSafeEnabled: false,
    healEnabled: false,
  },
  {
    id: 3,
    selectKey: "E",
    code: "STAGE 03",
    name: "CROSS CURRENT",
    koreanName: "크로스 커런트",
    description: "세 줄의 중앙이 교차하며 희귀 특수 패턴이 시작됩니다.",
    waves: 60,
    sections: [
      {
        startWave: 0,
        name: "CROSS IN",
        bpm: 108,
        activeKeys: keysFrom("WERTASDFGH"),
        attackBeats: 3.5,
      },
      {
        startWave: 15,
        name: "UPSTREAM",
        bpm: 126,
        activeKeys: keysFrom("QWERTYUIASDFGHJKL"),
        attackBeats: 3,
      },
      {
        startWave: 30,
        name: "UNDERTOW",
        bpm: 94,
        activeKeys: keysFrom("ERTYASDFGHCV"),
        attackBeats: 3.75,
      },
      {
        startWave: 45,
        name: "CROSS OUT",
        bpm: 132,
        activeKeys: keysFrom("QWERTYUIASDFGHJKLCV"),
        attackBeats: 2.75,
      },
    ],
    startingIntensity: 2,
    maxIntensity: 3,
    lastSafeEnabled: true,
    healEnabled: true,
  },
  {
    id: 4,
    selectKey: "R",
    code: "STAGE 04",
    name: "FOLDING FIELD",
    koreanName: "폴딩 필드",
    description: "넓어진 전장이 급격히 접힌 뒤 더 빠르게 펼쳐집니다.",
    waves: 64,
    sections: [
      {
        startWave: 0,
        name: "FIRST FOLD",
        bpm: 116,
        activeKeys: keysFrom("WERTYASDFGHJ"),
        attackBeats: 3.25,
      },
      {
        startWave: 16,
        name: "FIELD OPEN",
        bpm: 136,
        activeKeys: keysFrom("QWERTYUIOASDFGHJKLCV"),
        attackBeats: 3,
      },
      {
        startWave: 32,
        name: "FIELD FOLD",
        bpm: 102,
        activeKeys: keysFrom("ERTYUIASDFGHCV"),
        attackBeats: 3.75,
      },
      {
        startWave: 48,
        name: "FULL SPREAD",
        bpm: 142,
        activeKeys: keysFrom("QWERTYUIOASDFGHJKLZXCV"),
        attackBeats: 2.75,
      },
    ],
    startingIntensity: 2,
    maxIntensity: 3,
    lastSafeEnabled: true,
    healEnabled: true,
  },
  {
    id: 5,
    selectKey: "T",
    code: "STAGE 05",
    name: "TEMPO FAULT",
    koreanName: "템포 폴트",
    description: "거의 모든 키가 열리고 빠른 균열 뒤 큰 감속이 찾아옵니다.",
    waves: 68,
    sections: [
      {
        startWave: 0,
        name: "FAULT LINE",
        bpm: 124,
        activeKeys: keysFrom("QWERTYASDFGHJKL"),
        attackBeats: 3.5,
      },
      {
        startWave: 17,
        name: "RAPID BREAK",
        bpm: 146,
        activeKeys: keysFrom("QWERTYUIOPASDFGHJKLZXCV"),
        attackBeats: 3,
      },
      {
        startWave: 34,
        name: "DEEP DROP",
        bpm: 108,
        activeKeys: keysFrom("ERTYUIASDFGHJKCVB"),
        attackBeats: 3.75,
      },
      {
        startWave: 51,
        name: "FAULT RUSH",
        bpm: 150,
        activeKeys: keysFrom("QWERTYUIOPASDFGHJKLZXCVBN"),
        attackBeats: 2.75,
      },
    ],
    startingIntensity: 2,
    maxIntensity: 3,
    lastSafeEnabled: true,
    healEnabled: true,
  },
  {
    id: 6,
    selectKey: "Y",
    code: "STAGE 06",
    name: "TOTAL SHIFT",
    koreanName: "토털 시프트",
    description: "전체 키보드가 열리고 접히기를 반복하는 최종 시퀀스입니다.",
    waves: 72,
    sections: [
      {
        startWave: 0,
        name: "WIDE ENTRY",
        bpm: 132,
        activeKeys: keysFrom("QWERTYUIASDFGHJKLC"),
        attackBeats: 3.5,
      },
      {
        startWave: 18,
        name: "TOTAL OPEN",
        bpm: 152,
        activeKeys: ALL_KEYS,
        attackBeats: 3,
      },
      {
        startWave: 36,
        name: "LAST BREATH",
        bpm: 116,
        activeKeys: keysFrom("ERTYUIOASDFGHJKLZXCV"),
        attackBeats: 3.75,
      },
      {
        startWave: 54,
        name: "FINAL SHIFT",
        bpm: 156,
        activeKeys: ALL_KEYS,
        attackBeats: 2.75,
      },
    ],
    startingIntensity: 2,
    maxIntensity: 3,
    lastSafeEnabled: true,
    healEnabled: true,
  },
];

export function getStage(stageId: StageId) {
  const stage = STAGES.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`Unknown stage: ${stageId}`);
  return stage;
}

function getAuthoredKeyRange(stage: StageConfig) {
  const counts = stage.sections.map((section) => section.activeKeys.length);
  return { min: Math.min(...counts), max: Math.max(...counts) };
}

function resizeAuthoredZone(
  authoredKeys: readonly string[],
  desiredCount: number,
) {
  const desired = Math.max(2, Math.min(ALL_KEYS.length, desiredCount));
  const selected = new Set(authoredKeys);

  if (selected.size < desired) {
    for (const key of ALL_KEYS) {
      selected.add(key);
      if (selected.size >= desired) break;
    }
  } else if (selected.size > desired) {
    for (const key of [...ALL_KEYS].reverse()) {
      if (key === "F" || !selected.has(key)) continue;
      selected.delete(key);
      if (selected.size <= desired) break;
    }
  }

  selected.add("F");
  return ALL_KEYS.filter((key) => selected.has(key)).slice(0, desired);
}

function getZoneTargetCount(
  stage: StageConfig,
  sectionIndex: number,
  waveIndex: number,
) {
  const section = stage.sections[sectionIndex];
  const sectionOffset = waveIndex - section.startWave;
  const pulseIndex = Math.floor(sectionOffset / ZONE_PULSE_WAVES);
  const baseCount = section.activeKeys.length;

  if (pulseIndex % 2 === 0) return baseCount;

  const range = getAuthoredKeyRange(stage);
  const pulseSize = Math.max(2, Math.round((range.max - range.min) / 4));
  const prefersExpansion = sectionIndex === 0 || sectionIndex === 2;
  return prefersExpansion
    ? Math.min(range.max, baseCount + pulseSize)
    : Math.max(range.min, baseCount - pulseSize);
}

function getProfileZoneKeys(
  stage: StageConfig,
  sectionIndex: number,
  waveIndex: number,
) {
  const section = stage.sections[sectionIndex];
  return resizeAuthoredZone(
    section.activeKeys,
    getZoneTargetCount(stage, sectionIndex, waveIndex),
  );
}

function getZoneTransitionWarningBeats(kind: ZoneTransitionKind) {
  if (kind === "collapse") return COLLAPSE_WARNING_BEATS;
  if (kind === "restore") return RESTORE_WARNING_BEATS;
  return 0;
}

export function getWaveProfile(
  stage: StageConfig,
  waveIndex: number,
): WaveProfile {
  const clampedWaveIndex = Math.max(
    0,
    Math.min(
      stage.waves - 1,
      Number.isFinite(waveIndex) ? Math.floor(waveIndex) : 0,
    ),
  );
  let sectionIndex = 0;

  for (let index = 1; index < stage.sections.length; index += 1) {
    if (stage.sections[index].startWave > clampedWaveIndex) break;
    sectionIndex = index;
  }

  const section = stage.sections[sectionIndex];
  const nextSection = stage.sections[sectionIndex + 1];
  const activeKeys = getProfileZoneKeys(stage, sectionIndex, clampedWaveIndex);
  let zoneTransitionKind: ZoneTransitionKind = "none";

  if (clampedWaveIndex > 0) {
    const previousWaveIndex = clampedWaveIndex - 1;
    let previousSectionIndex = sectionIndex;
    if (previousWaveIndex < section.startWave) previousSectionIndex -= 1;
    const previousCount = getZoneTargetCount(
      stage,
      previousSectionIndex,
      previousWaveIndex,
    );
    zoneTransitionKind =
      activeKeys.length < previousCount
        ? "collapse"
        : activeKeys.length > previousCount
          ? "restore"
          : "none";
  }

  return {
    waveIndex: clampedWaveIndex,
    sectionIndex,
    sectionName: section.name,
    sectionStartWave: section.startWave,
    sectionEndWave: (nextSection?.startWave ?? stage.waves) - 1,
    bpm: section.bpm,
    beatMs: 60_000 / section.bpm,
    attackBeats: section.attackBeats,
    activeKeys,
    isSectionStart: clampedWaveIndex === section.startWave,
    zoneTargetCount: activeKeys.length,
    zoneTransitionKind,
  };
}

export function getBeatMs(stage: StageConfig, waveIndex = 0) {
  return getWaveProfile(stage, waveIndex).beatMs;
}

export function getNextWaveTiming(
  stage: StageConfig,
  waveIndex: number,
  previousImpactAt: number,
  transitionPlan?: ZoneTransitionPlan,
): WaveTiming {
  const profile = getWaveProfile(stage, waveIndex);
  const warningBeats = transitionPlan
    ? transitionPlan.warningBeats
    : getZoneTransitionWarningBeats(profile.zoneTransitionKind);
  const zoneDelayMs = profile.beatMs * warningBeats;
  const impactAt =
    previousImpactAt + zoneDelayMs + profile.beatMs * profile.attackBeats;
  return {
    warningAt: impactAt - profile.beatMs,
    impactAt,
    zoneWarningAt: zoneDelayMs > 0 ? previousImpactAt : null,
    zoneApplyAt: zoneDelayMs > 0 ? previousImpactAt + zoneDelayMs : null,
  };
}

export function getZoneTransition(
  stage: StageConfig,
  waveIndex: number,
  previousActiveKeys: readonly string[],
  previousDangerKeys: readonly string[] = [],
): ZoneTransitionPlan {
  const profile = getWaveProfile(stage, waveIndex);
  const fromKeys = previousActiveKeys.length
    ? ALL_KEYS.filter((key) => previousActiveKeys.includes(key))
    : [...profile.activeKeys];

  if (!fromKeys.includes("F")) {
    throw new Error("Every active key zone must include F");
  }

  const desiredCount = profile.zoneTargetCount;
  let kind: ZoneTransitionKind = "none";
  let toKeys = [...fromKeys];
  let collapsingKeys: string[] = [];
  let restoringKeys: string[] = [];
  let dangerDrivenKeys: string[] = [];

  if (desiredCount < fromKeys.length) {
    const removalLimit = fromKeys.length - desiredCount;
    const dangerCandidates = fromKeys.filter(
      (key) => key !== "F" && previousDangerKeys.includes(key),
    );
    collapsingKeys = dangerCandidates.slice(0, removalLimit);
    dangerDrivenKeys = [...collapsingKeys];

    if (collapsingKeys.length > 0) {
      kind = "collapse";
      const removed = new Set(collapsingKeys);
      toKeys = fromKeys.filter((key) => !removed.has(key));
    }
  } else if (desiredCount > fromKeys.length) {
    kind = "restore";
    const restoreLimit = desiredCount - fromKeys.length;
    const current = new Set(fromKeys);
    const preferred = [
      ...profile.activeKeys.filter((key) => !current.has(key)),
      ...ALL_KEYS.filter((key) => !current.has(key)),
    ];
    restoringKeys = [...new Set(preferred)].slice(0, restoreLimit);
    toKeys = ALL_KEYS.filter(
      (key) => current.has(key) || restoringKeys.includes(key),
    );
  }

  const warningBeats = getZoneTransitionWarningBeats(kind);
  return {
    kind,
    waveIndex: profile.waveIndex,
    triggerAfterWaveIndex: profile.waveIndex > 0 ? profile.waveIndex - 1 : null,
    warningBeats,
    warningMs: profile.beatMs * warningBeats,
    fromKeys,
    toKeys,
    collapsingKeys,
    restoringKeys,
    dangerDrivenKeys,
  };
}

export function getStageDurationMs(stage: StageConfig) {
  const openingProfile = getWaveProfile(stage, 0);
  let durationMs = openingProfile.beatMs;
  let runtimeActiveKeys = [...openingProfile.activeKeys];

  for (let waveIndex = 1; waveIndex < stage.waves; waveIndex += 1) {
    const profile = getWaveProfile(stage, waveIndex);
    const previousPattern = getAttackPattern(
      waveIndex - 1,
      stage,
      runtimeActiveKeys,
    );
    const transition = getZoneTransition(
      stage,
      waveIndex,
      runtimeActiveKeys,
      previousPattern.targets,
    );

    if (transition.kind !== "none") {
      const previousProfile = getWaveProfile(stage, waveIndex - 1);
      durationMs +=
        getImpactHoldMs(previousProfile.beatMs) + transition.warningMs;
      runtimeActiveKeys = [...transition.toKeys];
    }

    durationMs += profile.beatMs * profile.attackBeats;
  }

  return durationMs;
}

export function getImpactHoldMs(beatMs: number) {
  return Math.min(180, Math.max(0, beatMs) * 0.35);
}

export function getNearestActiveKey(
  playerKey: string,
  activeKeys: readonly string[],
) {
  const origin = KEY_COORDINATES.get(playerKey);
  if (!origin) {
    throw new Error(`Unknown keyboard key: ${playerKey}`);
  }

  // Filter through ALL_KEYS so equal-distance ties always resolve in the same
  // physical top-to-bottom, left-to-right order, regardless of caller order.
  const candidates = ALL_KEYS.filter((key) => activeKeys.includes(key));
  if (candidates.length === 0) {
    throw new Error("At least one valid active key is required");
  }

  let nearestKey = candidates[0];
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const coordinate = KEY_COORDINATES.get(candidate)!;
    const deltaX = origin.x - coordinate.x;
    const deltaY = origin.y - coordinate.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;

    if (distanceSquared < nearestDistanceSquared) {
      nearestKey = candidate;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearestKey;
}

export function resolveZoneEntry(
  playerKey: string,
  activeKeys: readonly string[],
): ZoneEntryResolution {
  if (!activeKeys.includes("F")) {
    throw new Error("Every active key zone must include F");
  }
  const recentered = !activeKeys.includes(playerKey);
  return {
    playerKey: recentered
      ? getNearestActiveKey(playerKey, activeKeys)
      : playerKey,
    recentered,
  };
}

export function getCountdownDurationMs(stage: StageConfig) {
  return getBeatMs(stage, 0) * COUNTDOWN_BEATS;
}

export function getStageTempoRange(stage: StageConfig): StageRange {
  const tempos = stage.sections.map((section) => section.bpm);
  return { min: Math.min(...tempos), max: Math.max(...tempos) };
}

export function getStageKeyRange(stage: StageConfig): StageRange {
  const keyCounts = Array.from({ length: stage.waves }, (_, waveIndex) =>
    getWaveProfile(stage, waveIndex).activeKeys.length,
  );
  return { min: Math.min(...keyCounts), max: Math.max(...keyCounts) };
}

export function getStageSelectionAction(
  focusedStageId: StageId | null,
  inputStageId: StageId,
) {
  return focusedStageId === inputStageId ? "start" : "focus";
}

export function getCompletedWaveCount(waveIndex: number, fatal: boolean) {
  return fatal ? waveIndex : waveIndex + 1;
}

export function getWaveIntensity(stage: StageConfig, waveIndex: number) {
  const progress = waveIndex / Math.max(1, stage.waves - 1);
  const ramp = progress >= 0.66 ? 1 : 0;
  return Math.min(stage.maxIntensity, stage.startingIntensity + ramp);
}

function chooseKey(
  activeKeys: readonly string[],
  index: number,
  salt: number,
  avoid?: string,
) {
  let selectedIndex = (index * salt + salt) % activeKeys.length;
  if (activeKeys[selectedIndex] === avoid && activeKeys.length > 1) {
    selectedIndex =
      (selectedIndex + Math.max(1, salt % activeKeys.length)) %
      activeKeys.length;
  }
  return activeKeys[selectedIndex];
}

function normalizeTargets(
  targets: readonly string[],
  activeKeys: readonly string[],
  minimumSafeKeys = 1,
) {
  const active = new Set(activeKeys);
  const unique = [...new Set(targets.filter((key) => active.has(key)))];
  const safeKeyCount = Math.min(
    minimumSafeKeys,
    Math.max(1, activeKeys.length - 1),
  );
  const maximumTargets = activeKeys.length - safeKeyCount;
  return unique.slice(0, maximumTargets);
}

type SurfSequenceStep = Pick<
  SurfPattern,
  "direction" | "step" | "totalSteps"
>;

function getSurfPattern(
  index: number,
  stageWaves: number,
): SurfSequenceStep | null {
  if (index < SURF_FIRST_WAVE) return null;

  const elapsed = index - SURF_FIRST_WAVE;
  const sequenceIndex = Math.floor(elapsed / SURF_CYCLE_WAVES);
  const step = elapsed % SURF_CYCLE_WAVES;
  const sequenceStart =
    SURF_FIRST_WAVE + sequenceIndex * SURF_CYCLE_WAVES;

  if (
    step >= SURF_SEQUENCE_WAVES ||
    sequenceStart + SURF_SEQUENCE_WAVES > stageWaves
  ) {
    return null;
  }

  return {
    direction:
      sequenceIndex % 2 === 0 ? "left-to-right" : "right-to-left",
    step,
    totalSteps: SURF_SEQUENCE_WAVES,
  };
}

function getSurfTargets(
  activeKeys: readonly string[],
  surf: SurfSequenceStep,
) {
  const active = new Set(activeKeys);
  const orderedKeys = ALL_KEYS.filter((key) => active.has(key));
  const targetCount = Math.max(
    1,
    Math.min(orderedKeys.length - 2, Math.ceil(orderedKeys.length * 0.28)),
  );
  const coordinates = orderedKeys.map((key, order) => ({
    key,
    order,
    x: KEY_COORDINATES.get(key)!.x,
  }));
  const minimumX = Math.min(...coordinates.map(({ x }) => x));
  const maximumX = Math.max(...coordinates.map(({ x }) => x));
  const progress = surf.step / Math.max(1, surf.totalSteps - 1);
  const directedProgress =
    surf.direction === "left-to-right" ? progress : 1 - progress;
  const crestX = minimumX + (maximumX - minimumX) * directedProgress;

  const targets = coordinates
    .sort(
      (left, right) =>
        Math.abs(left.x - crestX) - Math.abs(right.x - crestX) ||
        left.order - right.order,
    )
    .slice(0, targetCount)
    .map(({ key }) => key);

  const normalizedTargets = normalizeTargets(targets, orderedKeys, 2);
  const targetXs = normalizedTargets.map(
    (key) => KEY_COORDINATES.get(key)!.x,
  );
  const targetMinimumX = Math.min(...targetXs);
  const targetMaximumX = Math.max(...targetXs);
  const keyboardWidth = KEY_ROWS[0].length;

  return {
    targets: normalizedTargets,
    surf: {
      ...surf,
      leftPercent: (targetMinimumX / keyboardWidth) * 100,
      widthPercent:
        ((targetMaximumX - targetMinimumX + 1) / keyboardWidth) * 100,
    } satisfies SurfPattern,
  };
}

export function getPattern(
  index: number,
  intensity: number,
  activeKeys: readonly string[] = ALL_KEYS,
) {
  const active = new Set(activeKeys);
  const rowPatterns = KEY_ROWS.map((row) =>
    row.filter((key) => active.has(key)),
  ).filter((row) => row.length > 0);
  const patterns: string[][] = [
    [...rowPatterns[index % rowPatterns.length]],
    activeKeys.filter((_, keyIndex) => keyIndex % 3 === index % 3),
    ALL_KEYS.filter((key) => active.has(key) && "QAZWSXEDCRFVTGB".includes(key)),
    ALL_KEYS.filter((key) => active.has(key) && "YHNUJMIKOLP".includes(key)),
    ALL_KEYS.filter((key) => active.has(key) && "QWERTASDFZXCV".includes(key)),
    ALL_KEYS.filter((key) => active.has(key) && "YUIOPHJKLMN".includes(key)),
  ];

  if (index % 7 === 6) {
    const anchorIndex = (index * 5 + 3) % activeKeys.length;
    return normalizeTargets(
      activeKeys.filter((_, keyIndex) => Math.abs(keyIndex - anchorIndex) <= 2),
      activeKeys,
      2,
    );
  }

  const base = patterns[index % patterns.length];
  if (intensity < 2 || index % 2 === 0) {
    return normalizeTargets(base, activeKeys, 2);
  }
  const extra = patterns[(index + 2) % patterns.length].filter(
    (key) => !base.includes(key),
  );
  return normalizeTargets(
    [...base, ...extra.slice(0, intensity + 1)],
    activeKeys,
    2,
  );
}

export function getAttackPattern(
  index: number,
  stage: StageConfig,
  runtimeActiveKeys?: readonly string[],
): AttackPattern {
  const profile = getWaveProfile(stage, index);
  const activeKeys = runtimeActiveKeys ?? profile.activeKeys;
  if (!activeKeys.includes("F")) {
    throw new Error("Every active key zone must include F");
  }
  const healWaveIndex = Math.min(
    stage.waves - 2,
    Math.max(11, Math.floor(stage.waves * 0.58)),
  );

  if (stage.healEnabled && index === healWaveIndex) {
    return {
      kind: "heal",
      targets: [],
      safeKey: null,
      healKey: chooseKey(activeKeys, index, 11),
      surf: null,
    };
  }

  if (stage.lastSafeEnabled && index >= 10 && (index - 10) % 19 === 0) {
    const safeKey = chooseKey(activeKeys, index, 7);
    return {
      kind: "last-safe",
      targets: activeKeys.filter((key) => key !== safeKey),
      safeKey,
      healKey: null,
      surf: null,
    };
  }

  const surfSequenceStep = getSurfPattern(index, stage.waves);
  const surfAttack = surfSequenceStep
    ? getSurfTargets(activeKeys, surfSequenceStep)
    : null;

  return {
    kind: "standard",
    targets: surfAttack
      ? surfAttack.targets
      : getPattern(index, getWaveIntensity(stage, index), activeKeys),
    safeKey: null,
    healKey: null,
    surf: surfAttack?.surf ?? null,
  };
}

export function resolveCollision(
  targets: readonly string[],
  player: string,
  now: number,
  invulnerableUntil: number,
) {
  const inDanger = targets.includes(player);
  const damaged = inDanger && now >= invulnerableUntil;

  return {
    inDanger,
    damaged,
    invulnerableUntil: damaged
      ? now + INVULNERABILITY_MS
      : invulnerableUntil,
  };
}

export function resolveHeal(
  healKey: string,
  player: string,
  lastInput: InputSnapshot,
  warningStartedAt: number,
  currentHp: number,
) {
  const qualified =
    player === healKey &&
    lastInput.key === healKey &&
    lastInput.at >= warningStartedAt;
  const nextHp = qualified ? Math.min(MAX_HP, currentHp + 1) : currentHp;

  return {
    qualified,
    healed: nextHp > currentHp,
    full: qualified && currentHp >= MAX_HP,
    hp: nextHp,
  };
}
