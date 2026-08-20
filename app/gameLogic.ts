export const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
] as const;

export const ALL_KEYS: readonly string[] = KEY_ROWS.flat();
export const ROUND_SECONDS = 45;
export const MAX_HP = 5;
export const BPM = 120;
export const BEAT_MS = 60_000 / BPM;
export const INVULNERABILITY_MS = 500;

export function getIntensity(remainingMs: number) {
  const elapsed = ROUND_SECONDS * 1000 - remainingMs;
  return elapsed > 30_000 ? 3 : elapsed > 15_000 ? 2 : 1;
}

export function getPattern(index: number, player: string, intensity: number) {
  const patterns: string[][] = [
    [...KEY_ROWS[index % KEY_ROWS.length]],
    ALL_KEYS.filter((_, keyIndex) => keyIndex % 3 === index % 3),
    ALL_KEYS.filter((key) => "QAZWSXEDCRFVTGB".includes(key)),
    ALL_KEYS.filter((key) => "YHNUJMIKOLP".includes(key)),
    ALL_KEYS.filter((key) => "QWERTASDFZXCV".includes(key)),
    ALL_KEYS.filter((key) => "YUIOPHJKLMN".includes(key)),
  ];

  if (index % 7 === 6) {
    const playerIndex = ALL_KEYS.indexOf(player);
    return ALL_KEYS.filter((_, keyIndex) =>
      Math.abs(keyIndex - playerIndex) <= 2,
    );
  }

  const base = patterns[index % patterns.length];
  if (intensity < 2 || index % 2 === 0) return base;
  const extra = patterns[(index + 2) % patterns.length].filter(
    (key) => !base.includes(key),
  );
  return [...base, ...extra.slice(0, intensity + 1)];
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
