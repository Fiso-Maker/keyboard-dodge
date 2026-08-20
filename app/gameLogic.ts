export const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
] as const;

export const ALL_KEYS: readonly string[] = KEY_ROWS.flat();
export const MAX_HP = 5;
export const INVULNERABILITY_MS = 500;
export const COUNTDOWN_BEATS = 3;

export type StageId = 1 | 2 | 3 | 4 | 5 | 6;
export type StageSelectKey = "Q" | "W" | "E" | "R" | "T" | "Y";
export type AttackKind = "standard" | "last-safe" | "heal";

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
}

export interface StageRange {
  min: number;
  max: number;
}

export interface WaveTiming {
  warningAt: number;
  impactAt: number;
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
    waves: 12,
    sections: [
      {
        startWave: 0,
        name: "CORE",
        bpm: 92,
        activeKeys: keysFrom("SDFGH"),
        attackBeats: 2.25,
      },
      {
        startWave: 3,
        name: "OPEN STEP",
        bpm: 104,
        activeKeys: keysFrom("ASDFGHJKL"),
        attackBeats: 2,
      },
      {
        startWave: 6,
        name: "BREATH",
        bpm: 82,
        activeKeys: keysFrom("SDFGHJ"),
        attackBeats: 2.5,
      },
      {
        startWave: 9,
        name: "FINAL REACH",
        bpm: 110,
        activeKeys: keysFrom("WERTSDFGHJK"),
        attackBeats: 1.75,
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
    waves: 14,
    sections: [
      {
        startWave: 0,
        name: "INNER GRID",
        bpm: 100,
        activeKeys: keysFrom("ASDFGHJK"),
        attackBeats: 2,
      },
      {
        startWave: 4,
        name: "TOP OPEN",
        bpm: 116,
        activeKeys: keysFrom("WERTYASDFGHJK"),
        attackBeats: 1.75,
      },
      {
        startWave: 7,
        name: "LOW TIDE",
        bpm: 88,
        activeKeys: keysFrom("SDFGHJKCV"),
        attackBeats: 2.25,
      },
      {
        startWave: 10,
        name: "WIDE RETURN",
        bpm: 122,
        activeKeys: keysFrom("QWERTYASDFGHJKL"),
        attackBeats: 1.65,
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
    waves: 16,
    sections: [
      {
        startWave: 0,
        name: "CROSS IN",
        bpm: 108,
        activeKeys: keysFrom("WERTASDFGH"),
        attackBeats: 1.9,
      },
      {
        startWave: 4,
        name: "UPSTREAM",
        bpm: 126,
        activeKeys: keysFrom("QWERTYUIASDFGHJKL"),
        attackBeats: 1.65,
      },
      {
        startWave: 8,
        name: "UNDERTOW",
        bpm: 94,
        activeKeys: keysFrom("ERTYASDFGHCV"),
        attackBeats: 2.1,
      },
      {
        startWave: 12,
        name: "CROSS OUT",
        bpm: 132,
        activeKeys: keysFrom("QWERTYUIASDFGHJKLCV"),
        attackBeats: 1.5,
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
    waves: 18,
    sections: [
      {
        startWave: 0,
        name: "FIRST FOLD",
        bpm: 116,
        activeKeys: keysFrom("WERTYASDFGHJ"),
        attackBeats: 1.75,
      },
      {
        startWave: 5,
        name: "FIELD OPEN",
        bpm: 136,
        activeKeys: keysFrom("QWERTYUIOASDFGHJKLCV"),
        attackBeats: 1.5,
      },
      {
        startWave: 9,
        name: "FIELD FOLD",
        bpm: 102,
        activeKeys: keysFrom("ERTYUIASDFGHCV"),
        attackBeats: 2,
      },
      {
        startWave: 14,
        name: "FULL SPREAD",
        bpm: 142,
        activeKeys: keysFrom("QWERTYUIOASDFGHJKLZXCV"),
        attackBeats: 1.4,
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
    waves: 21,
    sections: [
      {
        startWave: 0,
        name: "FAULT LINE",
        bpm: 124,
        activeKeys: keysFrom("QWERTYASDFGHJKL"),
        attackBeats: 1.6,
      },
      {
        startWave: 5,
        name: "RAPID BREAK",
        bpm: 146,
        activeKeys: keysFrom("QWERTYUIOPASDFGHJKLZXCV"),
        attackBeats: 1.35,
      },
      {
        startWave: 11,
        name: "DEEP DROP",
        bpm: 108,
        activeKeys: keysFrom("ERTYUIASDFGHJKCVB"),
        attackBeats: 1.85,
      },
      {
        startWave: 16,
        name: "FAULT RUSH",
        bpm: 150,
        activeKeys: keysFrom("QWERTYUIOPASDFGHJKLZXCVBN"),
        attackBeats: 1.25,
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
    waves: 24,
    sections: [
      {
        startWave: 0,
        name: "WIDE ENTRY",
        bpm: 132,
        activeKeys: keysFrom("QWERTYUIASDFGHJKLC"),
        attackBeats: 1.5,
      },
      {
        startWave: 6,
        name: "TOTAL OPEN",
        bpm: 152,
        activeKeys: ALL_KEYS,
        attackBeats: 1.2,
      },
      {
        startWave: 12,
        name: "LAST BREATH",
        bpm: 116,
        activeKeys: keysFrom("ERTYUIOASDFGHJKLZXCV"),
        attackBeats: 1.75,
      },
      {
        startWave: 18,
        name: "FINAL SHIFT",
        bpm: 156,
        activeKeys: ALL_KEYS,
        attackBeats: 1.1,
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

  return {
    waveIndex: clampedWaveIndex,
    sectionIndex,
    sectionName: section.name,
    sectionStartWave: section.startWave,
    sectionEndWave: (nextSection?.startWave ?? stage.waves) - 1,
    bpm: section.bpm,
    beatMs: 60_000 / section.bpm,
    attackBeats: section.attackBeats,
    activeKeys: section.activeKeys,
    isSectionStart: clampedWaveIndex === section.startWave,
  };
}

export function getBeatMs(stage: StageConfig, waveIndex = 0) {
  return getWaveProfile(stage, waveIndex).beatMs;
}

export function getNextWaveTiming(
  stage: StageConfig,
  waveIndex: number,
  previousImpactAt: number,
): WaveTiming {
  const profile = getWaveProfile(stage, waveIndex);
  const impactAt = previousImpactAt + profile.beatMs * profile.attackBeats;
  return {
    warningAt: impactAt - profile.beatMs,
    impactAt,
  };
}

export function resolveZoneEntry(
  playerKey: string,
  activeKeys: readonly string[],
): ZoneEntryResolution {
  if (!activeKeys.includes("F")) {
    throw new Error("Every active key zone must include F");
  }
  const recentered = !activeKeys.includes(playerKey);
  return { playerKey: recentered ? "F" : playerKey, recentered };
}

export function getCountdownDurationMs(stage: StageConfig) {
  return getBeatMs(stage, 0) * COUNTDOWN_BEATS;
}

export function getStageTempoRange(stage: StageConfig): StageRange {
  const tempos = stage.sections.map((section) => section.bpm);
  return { min: Math.min(...tempos), max: Math.max(...tempos) };
}

export function getStageKeyRange(stage: StageConfig): StageRange {
  const keyCounts = stage.sections.map((section) => section.activeKeys.length);
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
): AttackPattern {
  const profile = getWaveProfile(stage, index);

  if (stage.healEnabled && index >= 11 && (index - 11) % 17 === 0) {
    return {
      kind: "heal",
      targets: [],
      safeKey: null,
      healKey: chooseKey(profile.activeKeys, index, 11),
    };
  }

  if (stage.lastSafeEnabled && index >= 8 && (index - 8) % 11 === 0) {
    const safeKey = chooseKey(profile.activeKeys, index, 7);
    return {
      kind: "last-safe",
      targets: profile.activeKeys.filter((key) => key !== safeKey),
      safeKey,
      healKey: null,
    };
  }

  return {
    kind: "standard",
    targets: getPattern(
      index,
      getWaveIntensity(stage, index),
      profile.activeKeys,
    ),
    safeKey: null,
    healKey: null,
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
