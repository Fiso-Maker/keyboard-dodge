"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ALL_KEYS,
  AttackKind,
  COUNTDOWN_BEATS,
  getAttackPattern,
  getBeatMs,
  getCompletedWaveCount,
  getNextWaveTiming,
  getStage,
  getStageKeyRange,
  getStageSelectionAction,
  getStageTempoRange,
  getWaveProfile,
  InputSnapshot,
  INVULNERABILITY_MS,
  KEY_ROWS,
  MAX_HP,
  resolveCollision,
  resolveHeal,
  resolveZoneEntry,
  STAGES,
  StageId,
  WaveProfile,
} from "./gameLogic";

type Phase =
  | "title"
  | "select"
  | "countdown"
  | "running"
  | "paused"
  | "won"
  | "lost";
type AttackState = "idle" | "warning" | "impact";
type HealFeedback = "idle" | "success" | "full" | "miss";
type PausedAttackMode = "warning" | "between" | "finish";
type ZoneShift = "steady" | "expand" | "contract";
type TempoShift = "steady" | "up" | "down";

interface PausedAttackSchedule {
  stageId: StageId;
  waveIndex: number;
  mode: PausedAttackMode;
  remainingMs: number;
  warningStartedAt: number;
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.isContentEditable ||
      element?.tagName === "INPUT" ||
      element?.tagName === "TEXTAREA" ||
      element?.tagName === "SELECT",
  );
}

function isNativeButtonActivation(event: KeyboardEvent) {
  if (event.code !== "Enter" && event.code !== "Space") return false;
  const element = event.target as Element | null;
  return Boolean(element?.closest("button, a[href]"));
}

export function KeyboardDodge() {
  const [phase, setPhase] = useState<Phase>("title");
  const [selectedStageId, setSelectedStageId] = useState<StageId | null>(null);
  const [focusedStageId, setFocusedStageId] = useState<StageId | null>(null);
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_BEATS);
  const [playerKey, setPlayerKey] = useState("F");
  const [hp, setHp] = useState(MAX_HP);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [completedWaves, setCompletedWaves] = useState(0);
  const [targets, setTargets] = useState<string[]>([]);
  const [attackState, setAttackState] = useState<AttackState>("idle");
  const [attackKind, setAttackKind] = useState<AttackKind>("standard");
  const [specialKey, setSpecialKey] = useState<string | null>(null);
  const [healFeedback, setHealFeedback] = useState<HealFeedback>("idle");
  const [hurt, setHurt] = useState(false);
  const [muted, setMuted] = useState(false);
  const [waveProfile, setWaveProfile] = useState<WaveProfile | null>(null);
  const [zoneShift, setZoneShift] = useState<ZoneShift>("steady");
  const [tempoShift, setTempoShift] = useState<TempoShift>("steady");
  const [autoRecentered, setAutoRecentered] = useState(false);

  const selectedStage = useMemo(
    () => (selectedStageId ? getStage(selectedStageId) : null),
    [selectedStageId],
  );
  const focusedStage = useMemo(
    () => (focusedStageId ? getStage(focusedStageId) : null),
    [focusedStageId],
  );
  const activeKeys = waveProfile?.activeKeys ?? [];

  const playerKeyRef = useRef(playerKey);
  const phaseRef = useRef(phase);
  const hpRef = useRef(hp);
  const invulnerableUntilRef = useRef(0);
  const attackIndexRef = useRef(0);
  const lastInputRef = useRef<InputSnapshot>({ key: "", at: -Infinity });
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);
  const pausedAttackRef = useRef<PausedAttackSchedule | null>(null);
  const pausedInvulnerabilityRef = useRef(0);
  const countdownStartedAtRef = useRef(0);
  const waveProfileRef = useRef<WaveProfile | null>(null);

  useEffect(() => {
    playerKeyRef.current = playerKey;
  }, [playerKey]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    hpRef.current = hp;
  }, [hp]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(
    () => () => {
      const context = audioRef.current;
      audioRef.current = null;
      if (context && context.state !== "closed") void context.close();
    },
    [],
  );

  const playTone = useCallback(
    (frequency: number, duration = 0.06, volume = 0.04) => {
      if (mutedRef.current || typeof window === "undefined") return;
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;

      const context = audioRef.current ?? new AudioContextClass();
      audioRef.current = context;
      if (context.state === "suspended") void context.resume();

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gain.disconnect();
      });
    },
    [],
  );

  const toggleMuted = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      mutedRef.current = next;
      return next;
    });
  }, []);

  const startStage = useCallback(
    (stageId: StageId) => {
      const openingProfile = getWaveProfile(getStage(stageId), 0);
      setSelectedStageId(stageId);
      setPlayerKey("F");
      playerKeyRef.current = "F";
      setHp(MAX_HP);
      hpRef.current = MAX_HP;
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setCompletedWaves(0);
      setTargets([]);
      setAttackState("idle");
      setAttackKind("standard");
      setSpecialKey(null);
      setHealFeedback("idle");
      setHurt(false);
      setWaveProfile(openingProfile);
      waveProfileRef.current = openingProfile;
      setZoneShift("steady");
      setTempoShift("steady");
      setAutoRecentered(false);
      attackIndexRef.current = 0;
      invulnerableUntilRef.current = 0;
      lastInputRef.current = { key: "", at: -Infinity };
      pausedAttackRef.current = null;
      pausedInvulnerabilityRef.current = 0;
      countdownStartedAtRef.current = performance.now();
      setCountdownValue(COUNTDOWN_BEATS);
      phaseRef.current = "countdown";
      setPhase("countdown");
      playTone(460 + stageId * 20, 0.09, 0.04);
    },
    [playTone],
  );

  const showStageSelect = useCallback(() => {
    phaseRef.current = "select";
    setPhase("select");
    setSelectedStageId(null);
    setPlayerKey("F");
    playerKeyRef.current = "F";
    setHp(MAX_HP);
    hpRef.current = MAX_HP;
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCompletedWaves(0);
    setTargets([]);
    setAttackState("idle");
    setAttackKind("standard");
    setSpecialKey(null);
    setHealFeedback("idle");
    setHurt(false);
    setWaveProfile(null);
    waveProfileRef.current = null;
    setZoneShift("steady");
    setTempoShift("steady");
    setAutoRecentered(false);
    attackIndexRef.current = 0;
    invulnerableUntilRef.current = 0;
    lastInputRef.current = { key: "", at: -Infinity };
    pausedAttackRef.current = null;
    pausedInvulnerabilityRef.current = 0;
    setCountdownValue(COUNTDOWN_BEATS);
    setFocusedStageId(null);
  }, []);

  const showTitle = useCallback(() => {
    phaseRef.current = "title";
    setPhase("title");
    setSelectedStageId(null);
    setPlayerKey("F");
    playerKeyRef.current = "F";
    setHp(MAX_HP);
    hpRef.current = MAX_HP;
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCompletedWaves(0);
    setTargets([]);
    setAttackState("idle");
    setAttackKind("standard");
    setSpecialKey(null);
    setHealFeedback("idle");
    setHurt(false);
    setWaveProfile(null);
    waveProfileRef.current = null;
    setZoneShift("steady");
    setTempoShift("steady");
    setAutoRecentered(false);
    attackIndexRef.current = 0;
    invulnerableUntilRef.current = 0;
    lastInputRef.current = { key: "", at: -Infinity };
    pausedAttackRef.current = null;
    pausedInvulnerabilityRef.current = 0;
    setCountdownValue(COUNTDOWN_BEATS);
    setFocusedStageId(null);
  }, []);

  const enterStageSelect = useCallback(() => {
    showStageSelect();
    playTone(340, 0.1, 0.035);
  }, [playTone, showStageSelect]);

  const focusStage = useCallback(
    (stageId: StageId) => {
      setFocusedStageId(stageId);
      playTone(260 + stageId * 70, 0.06, 0.025);
      document
        .querySelector<HTMLButtonElement>(`[data-stage-id="${stageId}"]`)
        ?.focus();
    },
    [playTone],
  );

  const chooseStage = useCallback(
    (stageId: StageId) => {
      if (getStageSelectionAction(focusedStageId, stageId) === "start") {
        startStage(stageId);
      } else {
        focusStage(stageId);
      }
    },
    [focusStage, focusedStageId, startStage],
  );

  const cancelCountdown = useCallback(() => {
    phaseRef.current = "select";
    setPhase("select");
    setSelectedStageId(null);
    setFocusedStageId(null);
    setCountdownValue(COUNTDOWN_BEATS);
    setTargets([]);
    setAttackState("idle");
    setAttackKind("standard");
    setSpecialKey(null);
    setHealFeedback("idle");
    setHurt(false);
    setWaveProfile(null);
    waveProfileRef.current = null;
    setZoneShift("steady");
    setTempoShift("steady");
    setAutoRecentered(false);
  }, []);

  const moveTo = useCallback(
    (key: string) => {
      if (phaseRef.current !== "running" || !selectedStageId) return;
      if (!waveProfileRef.current?.activeKeys.includes(key)) return;

      lastInputRef.current = { key, at: performance.now() };
      if (playerKeyRef.current !== key) {
        playerKeyRef.current = key;
        setPlayerKey(key);
      }
      playTone(280 + ALL_KEYS.indexOf(key) * 9, 0.035, 0.018);
    },
    [playTone, selectedStageId],
  );

  const resumeGame = useCallback(() => {
    invulnerableUntilRef.current =
      performance.now() + pausedInvulnerabilityRef.current;
    pausedInvulnerabilityRef.current = 0;
    phaseRef.current = "running";
    setPhase("running");
  }, []);

  const pauseGame = useCallback(() => {
    pausedInvulnerabilityRef.current = Math.max(
      0,
      invulnerableUntilRef.current - performance.now(),
    );
    phaseRef.current = "paused";
    setPhase("paused");
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.isComposing ||
        isTypingTarget(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      if (isNativeButtonActivation(event)) return;

      if (event.code === "Digit0") {
        toggleMuted();
        return;
      }

      if (phaseRef.current === "title") {
        if (event.code === "Space" || event.code === "Enter") {
          event.preventDefault();
          enterStageSelect();
        }
        return;
      }

      if (phaseRef.current === "select") {
        const directStage = STAGES.find(
          (stage) => event.code === `Key${stage.selectKey}`,
        );
        if (directStage) {
          event.preventDefault();
          chooseStage(directStage.id);
          return;
        }
        if (
          event.code === "ArrowLeft" ||
          event.code === "ArrowRight" ||
          event.code === "ArrowUp" ||
          event.code === "ArrowDown"
        ) {
          event.preventDefault();
          const delta =
            event.code === "ArrowRight"
              ? 1
              : event.code === "ArrowLeft"
                ? -1
                : event.code === "ArrowDown"
                  ? 3
                  : -3;
          if (!focusedStageId) {
            focusStage(
              delta > 0 ? STAGES[0].id : STAGES[STAGES.length - 1].id,
            );
            return;
          }
          const focusedIndex = STAGES.findIndex(
            (stage) => stage.id === focusedStageId,
          );
          const nextIndex =
            (focusedIndex + delta + STAGES.length) % STAGES.length;
          focusStage(STAGES[nextIndex].id);
          return;
        }
        if (event.code === "Space" || event.code === "Enter") {
          event.preventDefault();
          if (focusedStageId) startStage(focusedStageId);
          return;
        }
        if (event.code === "Escape") showTitle();
        return;
      }

      if (phaseRef.current === "countdown") {
        if (event.code === "Escape") cancelCountdown();
        return;
      }

      if (event.code === "Escape") {
        if (phaseRef.current === "running") pauseGame();
        else if (phaseRef.current === "paused") resumeGame();
        return;
      }

      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        if (
          (phaseRef.current === "won" || phaseRef.current === "lost") &&
          selectedStageId
        ) {
          const selectedIndex = STAGES.findIndex(
            (stage) => stage.id === selectedStageId,
          );
          const followingStage = STAGES[selectedIndex + 1];
          if (phaseRef.current === "won" && followingStage) {
            startStage(followingStage.id);
          } else {
            startStage(selectedStageId);
          }
        }
        return;
      }
      if (
        event.code === "KeyR" &&
        phaseRef.current !== "running" &&
        selectedStageId
      ) {
        startStage(selectedStageId);
        return;
      }

      const key = event.code.startsWith("Key") ? event.code.slice(3) : "";
      if (ALL_KEYS.includes(key)) moveTo(key);
    };

    const pauseIfPlaying = () => {
      if (phaseRef.current === "running") pauseGame();
      else if (phaseRef.current === "countdown") cancelCountdown();
    };

    const pauseWhenHidden = () => {
      if (document.hidden && phaseRef.current === "running") pauseGame();
      else if (document.hidden && phaseRef.current === "countdown") {
        cancelCountdown();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", pauseIfPlaying);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", pauseIfPlaying);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [
    cancelCountdown,
    chooseStage,
    focusedStageId,
    enterStageSelect,
    focusStage,
    moveTo,
    pauseGame,
    playTone,
    resumeGame,
    selectedStageId,
    showTitle,
    startStage,
    toggleMuted,
  ]);

  useEffect(() => {
    if (phase !== "countdown" || !selectedStageId) return;
    const stage = getStage(selectedStageId);
    const beatMs = getBeatMs(stage);
    let timer = 0;
    let cancelled = false;
    let currentValue = COUNTDOWN_BEATS;
    let nextBeatAt = countdownStartedAtRef.current + beatMs;

    const advanceCountdown = () => {
      if (cancelled || phaseRef.current !== "countdown") return;
      currentValue -= 1;

      if (currentValue > 0) {
        setCountdownValue(currentValue);
        playTone(
          460 + stage.id * 20 + (COUNTDOWN_BEATS - currentValue) * 110,
          0.09,
          0.04,
        );
        nextBeatAt += beatMs;
        timer = window.setTimeout(
          advanceCountdown,
          Math.max(0, nextBeatAt - performance.now()),
        );
        return;
      }

      playTone(920 + stage.id * 45, 0.14, 0.05);
      phaseRef.current = "running";
      setPhase("running");
    };

    timer = window.setTimeout(
      advanceCountdown,
      Math.max(0, nextBeatAt - performance.now()),
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, playTone, selectedStageId]);

  useEffect(() => {
    if (phase !== "running" || !selectedStageId) return;
    const stage = getStage(selectedStageId);
    let resolveTimer = 0;
    let clearTimer = 0;
    let nextTimer = 0;
    let hurtTimer = 0;
    let finishTimer = 0;
    let cancelled = false;
    let scheduleMode: PausedAttackMode | null = null;
    let scheduleDeadlineAt = 0;
    let warningStartedAt = -Infinity;
    let visualToken = 0;
    let nextImpactAt =
      performance.now() +
      getWaveProfile(stage, attackIndexRef.current).beatMs;

    const finishStage = () => {
      if (cancelled || phaseRef.current !== "running") return;
      scheduleMode = null;
      phaseRef.current = "won";
      setScore((value) => value + hpRef.current * 300 + stage.id * 500);
      setPhase("won");
      playTone(880 + stage.id * 80, 0.28, 0.06);
    };

    const runAttack = (restoredWarningStartedAt?: number) => {
      if (cancelled || phaseRef.current !== "running") return;
      const waveIndex = attackIndexRef.current;
      const profile = getWaveProfile(stage, waveIndex);
      const previousProfile = waveProfileRef.current;
      const nextZoneShift: ZoneShift = previousProfile
        ? profile.activeKeys.length > previousProfile.activeKeys.length
          ? "expand"
          : profile.activeKeys.length < previousProfile.activeKeys.length
            ? "contract"
            : "steady"
        : "steady";
      const nextTempoShift: TempoShift = previousProfile
        ? profile.bpm > previousProfile.bpm
          ? "up"
          : profile.bpm < previousProfile.bpm
            ? "down"
            : "steady"
        : "steady";
      const zoneEntry = resolveZoneEntry(
        playerKeyRef.current,
        profile.activeKeys,
      );
      const mustRecenter = zoneEntry.recentered;

      waveProfileRef.current = profile;
      setWaveProfile(profile);
      setZoneShift(nextZoneShift);
      setTempoShift(nextTempoShift);
      setAutoRecentered(mustRecenter);
      if (mustRecenter) {
        playerKeyRef.current = zoneEntry.playerKey;
        setPlayerKey(zoneEntry.playerKey);
        lastInputRef.current = { key: "", at: -Infinity };
      }

      const pattern = getAttackPattern(waveIndex, stage);
      warningStartedAt = restoredWarningStartedAt ?? performance.now();
      const playerIsTargeted = pattern.targets.includes(playerKeyRef.current);
      const waveVisualToken = ++visualToken;

      scheduleMode = "warning";
      scheduleDeadlineAt = nextImpactAt;

      setTargets(pattern.targets);
      setAttackKind(pattern.kind);
      setSpecialKey(pattern.safeKey ?? pattern.healKey);
      setHealFeedback("idle");
      setAttackState("warning");

      if (pattern.kind === "heal") {
        playTone(760, 0.11, 0.04);
      } else {
        playTone(
          playerIsTargeted ? 980 : 180 + stage.id * 30,
          playerIsTargeted ? 0.11 : 0.05,
          playerIsTargeted ? 0.045 : 0.025,
        );
      }

      resolveTimer = window.setTimeout(() => {
        scheduleMode = null;
        setAttackState("impact");
        let fatal = false;

        if (pattern.kind === "heal" && pattern.healKey) {
          const result = resolveHeal(
            pattern.healKey,
            playerKeyRef.current,
            lastInputRef.current,
            warningStartedAt,
            hpRef.current,
          );
          hpRef.current = result.hp;
          setHp(result.hp);

          if (result.qualified) {
            setHealFeedback(result.full ? "full" : "success");
            setScore((value) => value + (result.full ? 150 : 300));
            playTone(result.full ? 720 : 1040, 0.2, 0.055);
          } else {
            setHealFeedback("miss");
            playTone(150, 0.12, 0.025);
          }
        } else {
          playTone(90, 0.12, 0.045);
          const collision = resolveCollision(
            pattern.targets,
            playerKeyRef.current,
            performance.now(),
            invulnerableUntilRef.current,
          );

          if (collision.inDanger) {
            if (collision.damaged) {
              invulnerableUntilRef.current = collision.invulnerableUntil;
              const nextHp = Math.max(0, hpRef.current - 1);
              hpRef.current = nextHp;
              setHp(nextHp);
              setHurt(true);
              setStreak(0);
              fatal = nextHp === 0;
              if (fatal) {
                phaseRef.current = "lost";
                setPhase("lost");
                playTone(55, 0.35, 0.06);
              }
              hurtTimer = window.setTimeout(
                () => setHurt(false),
                INVULNERABILITY_MS,
              );
            }
          } else {
            setStreak((current) => {
              const next = current + 1;
              playTone(620 + Math.min(next, 12) * 12, 0.045, 0.018);
              setBestStreak((best) => Math.max(best, next));
              setScore(
                (value) =>
                  value +
                  (pattern.kind === "last-safe" ? 220 : 100) +
                  Math.min(next, 20) * 10,
              );
              return next;
            });
          }
        }

        const nextCompleted = getCompletedWaveCount(waveIndex, fatal);
        attackIndexRef.current = nextCompleted;
        setCompletedWaves(nextCompleted);

        clearTimer = window.setTimeout(() => {
          if (cancelled || visualToken !== waveVisualToken) return;
          setTargets([]);
          setAttackState("idle");
          setAttackKind("standard");
          setSpecialKey(null);
        }, Math.min(180, profile.beatMs * 0.35));

        if (fatal) return;

        if (nextCompleted >= stage.waves) {
          scheduleMode = "finish";
          scheduleDeadlineAt = performance.now() + 220;
          finishTimer = window.setTimeout(finishStage, 220);
          return;
        }

        const nextTiming = getNextWaveTiming(
          stage,
          nextCompleted,
          nextImpactAt,
        );
        nextImpactAt = nextTiming.impactAt;
        const nextWarningAt = nextTiming.warningAt;
        scheduleMode = "between";
        scheduleDeadlineAt = nextWarningAt;
        nextTimer = window.setTimeout(
          () => runAttack(),
          Math.max(0, nextWarningAt - performance.now()),
        );
      }, Math.max(0, nextImpactAt - performance.now()));
    };

    const pausedSchedule = pausedAttackRef.current;
    pausedAttackRef.current = null;

    if (
      pausedSchedule &&
      pausedSchedule.stageId === stage.id &&
      pausedSchedule.waveIndex === attackIndexRef.current
    ) {
      if (pausedSchedule.mode === "warning") {
        nextImpactAt = performance.now() + pausedSchedule.remainingMs;
        runAttack(pausedSchedule.warningStartedAt);
      } else if (pausedSchedule.mode === "between") {
        scheduleMode = "between";
        scheduleDeadlineAt = performance.now() + pausedSchedule.remainingMs;
        nextImpactAt =
          scheduleDeadlineAt +
          getWaveProfile(stage, attackIndexRef.current).beatMs;
        nextTimer = window.setTimeout(
          () => runAttack(),
          pausedSchedule.remainingMs,
        );
      } else {
        scheduleMode = "finish";
        scheduleDeadlineAt = performance.now() + pausedSchedule.remainingMs;
        finishTimer = window.setTimeout(
          finishStage,
          pausedSchedule.remainingMs,
        );
      }
    } else {
      runAttack();
    }

    return () => {
      if (phaseRef.current === "paused" && scheduleMode) {
        pausedAttackRef.current = {
          stageId: stage.id,
          waveIndex: attackIndexRef.current,
          mode: scheduleMode,
          remainingMs: Math.max(0, scheduleDeadlineAt - performance.now()),
          warningStartedAt,
        };
      } else if (phaseRef.current !== "paused") {
        pausedAttackRef.current = null;
      }
      cancelled = true;
      window.clearTimeout(resolveTimer);
      window.clearTimeout(clearTimer);
      window.clearTimeout(nextTimer);
      window.clearTimeout(hurtTimer);
      window.clearTimeout(finishTimer);
      setTargets([]);
      setAttackState("idle");
      setAttackKind("standard");
      setSpecialKey(null);
      setHealFeedback("idle");
      setHurt(false);
    };
  }, [phase, playTone, selectedStageId]);

  const progress = selectedStage
    ? (completedWaves / selectedStage.waves) * 100
    : 0;
  const selectedStageIndex = selectedStage
    ? STAGES.findIndex((stage) => stage.id === selectedStage.id)
    : -1;
  const nextStage =
    selectedStageIndex >= 0 ? (STAGES[selectedStageIndex + 1] ?? null) : null;
  const currentBpm = waveProfile?.bpm ?? null;
  const profileChanges = [
    tempoShift === "up"
      ? "TEMPO UP"
      : tempoShift === "down"
        ? "TEMPO DOWN"
        : "",
    zoneShift === "expand"
      ? "ZONE EXPAND"
      : zoneShift === "contract"
        ? "ZONE CONTRACT"
        : "",
    autoRecentered ? "AUTO RECENTER · KEY_F" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const playerThreatened =
    phase === "running" &&
    attackState === "warning" &&
    targets.includes(playerKey);
  const playerUnderImpact =
    attackState === "impact" && targets.includes(playerKey);
  const healWarning =
    attackKind === "heal" && attackState === "warning" && specialKey;
  const onlySafeWarning =
    attackKind === "last-safe" && attackState === "warning" && specialKey;
  const readoutState = hurt
    ? "hit"
    : healWarning || healFeedback === "success" || healFeedback === "full"
      ? "heal"
      : healFeedback === "miss"
        ? "miss"
        : playerThreatened
          ? "danger"
          : attackState === "warning"
            ? "safe"
            : "";
  const dangerLabel = hurt
    ? `HIT! · KEY_${playerKey} 피격 · HP ${hp}/${MAX_HP}`
    : healFeedback === "success"
      ? `RECOVERED · HP +1 · ${hp}/${MAX_HP}`
      : healFeedback === "full"
        ? `HP FULL · 회복 키 입력 성공 · ${hp}/${MAX_HP}`
        : healFeedback === "miss"
          ? "HEAL MISSED · 다음 시퀀스 준비"
          : healWarning
            ? `희귀 회복 · KEY_${specialKey}를 지금 입력하세요`
            : onlySafeWarning
              ? playerKey === specialKey
                ? `KEY_${specialKey}만 안전 · 현재 위치 유지`
                : `KEY_${specialKey}만 안전 · 즉시 이동!`
              : playerThreatened
                ? `현재 위치 KEY_${playerKey} 공격 대상 · MOVE!`
                : attackState === "warning"
                  ? `현재 위치 KEY_${playerKey} 안전`
                  : attackState === "impact"
                    ? "공격 판정"
                    : selectedStage
                      ? profileChanges ||
                        `SEQUENCE ${Math.min(completedWaves + 1, selectedStage.waves)} READY`
                      : "STAGE SELECT";

  if (phase === "title") {
    return (
      <main className="entry-shell title-entry">
        <div className="ambient-grid" aria-hidden="true" />
        <div className="title-corner top-left" aria-hidden="true">SYS.KEYDODGE</div>
        <div className="title-corner top-right" aria-hidden="true">PHYSICAL INPUT REQUIRED</div>

        <section className="title-hero" aria-labelledby="game-title">
          <p className="title-kicker">QWERTY RHYTHM ACTION / 06 STAGES</p>
          <h1 id="game-title" className="title-logo">
            <span>KEY</span><i>{"//"}</i><span>DODGE</span>
          </h1>
          <p className="title-copy">
            실제 키보드를 전장으로 바꾸세요.<br />
            감속·가속 신호와 확장·축소되는 키 존을 읽고 스테이지를 돌파합니다.
          </p>

          <div className="title-specs" aria-label="게임 구성">
            <span><b>06</b> STAGES</span>
            <span><b>05—26</b> KEYS</span>
            <span><b>82—156</b> BPM</span>
          </div>

          <button className="title-start" type="button" onClick={enterStageSelect}>
            <span>STAGE MAP 열기</span>
            <kbd>SPACE / ENTER</kbd>
          </button>
          <p className="title-hint">물리 키보드가 있는 데스크톱 환경을 권장합니다.</p>
        </section>

        <div className="title-corner bottom-left" aria-hidden="true">BUILD 0.5 / LOCAL</div>
        <div className="title-corner bottom-right" aria-hidden="true">PRESS START</div>
      </main>
    );
  }

  if (phase === "select") {
    return (
      <main className="entry-shell stage-select-shell">
        <div className="ambient-grid" aria-hidden="true" />
        <header className="stage-select-topbar">
          <button className="back-button" type="button" onClick={showTitle}>
            <kbd>ESC</kbd> TITLE
          </button>
          <div className="stage-select-brand">
            KEY<span>{"//"}</span>DODGE
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? "소리 켜기" : "소리 끄기"}
          >
            {muted ? "MUTED" : "SOUND"}
          </button>
        </header>

        <section className="stage-map-shell" aria-labelledby="stage-map-title">
          <div className="stage-map-intro">
            <p className="overlay-code">STAGE_SELECT</p>
            <h2 id="stage-map-title">공략할<br />스테이지를 선택하세요</h2>
            <p>
              Q부터 Y까지 한 번 누르면 스테이지가 강조됩니다. 같은 키를 한 번
              더 눌러 확정하세요. 플레이 중 BPM과 활성 키 존이 구간마다 변합니다.
            </p>
            <div className="stage-controls" aria-label="스테이지 선택 조작">
              <span><kbd>QWERTY</kbd> FOCUS / CONFIRM</span>
              <span><kbd>ARROWS</kbd> FOCUS</span>
              <span><kbd>ENTER</kbd> CONFIRM</span>
            </div>
          </div>

          <div className="stage-track" aria-label="스테이지 목록">
            {STAGES.map((stage) => {
              const focused = focusedStageId === stage.id;
              const keyRange = getStageKeyRange(stage);
              const tempoRange = getStageTempoRange(stage);
              return (
                <button
                  type="button"
                  data-stage-id={stage.id}
                  className={`stage-card stage-${stage.id} ${focused ? "is-focused" : ""}`}
                  key={stage.id}
                  onClick={() => chooseStage(stage.id)}
                  aria-pressed={focused}
                >
                  <span className="stage-number">{stage.code}</span>
                  <kbd className="stage-hotkey">{stage.selectKey}</kbd>
                  <strong>{stage.name}</strong>
                  <em>{stage.koreanName}</em>
                  <span className="stage-description">{stage.description}</span>
                  <span className="stage-metrics">
                    <b>{keyRange.min}↔{keyRange.max}<small> KEYS</small></b>
                    <b>{stage.waves}<small> WAVES</small></b>
                    <b>{tempoRange.min}—{tempoRange.max}<small> BPM</small></b>
                  </span>
                  <span className="stage-enter">
                    {focused
                      ? `PRESS ${stage.selectKey} AGAIN TO START`
                      : `PRESS ${stage.selectKey} TO FOCUS`}
                    <i>→</i>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="stage-select-footer">
          <span>
            {focusedStage
              ? `${focusedStage.code} ARMED · ${getStageTempoRange(focusedStage).min}—${getStageTempoRange(focusedStage).max} BPM · VARIABLE ZONES`
              : "NO STAGE FOCUSED · PRESS Q / W / E / R / T / Y"}
          </span>
          <span>FIRST PRESS = FOCUS · SECOND PRESS = START</span>
        </footer>
      </main>
    );
  }

  return (
    <main
      className={`game-shell ${hurt ? "is-hurt" : ""} ${playerThreatened ? "is-threatened" : ""}`}
      style={
        {
          "--current-beat": `${waveProfile?.beatMs ?? 500}ms`,
          "--warning-pulse": `${(waveProfile?.beatMs ?? 500) / 2}ms`,
        } as CSSProperties
      }
    >
      <div className="ambient-grid" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">K</span>
          <div>
            <p className="eyebrow">QWERTY RHYTHM SEQUENCE</p>
            <h1>KEY<span>{"//"}</span>DODGE</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`status-light ${phase === "running" || phase === "countdown" ? "active" : ""}`}>
            <i aria-hidden="true" />
            {phase === "running" ? "LIVE" : phase === "countdown" ? "SYNC" : "STANDBY"}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? "소리 켜기" : "소리 끄기"}
          >
            {muted ? "MUTED" : "SOUND"}
          </button>
        </div>
      </header>

      <section className="play-layout" aria-label="게임 화면">
        <aside className="stat-panel">
          <div className="stat-block health-block">
            <p>INTEGRITY</p>
            <div className="hearts" aria-label={`체력 ${hp} / ${MAX_HP}`}>
              {Array.from({ length: MAX_HP }).map((_, index) => (
                <span key={index} className={index < hp ? "filled" : ""}>
                  {index < hp ? "◆" : "◇"}
                </span>
              ))}
            </div>
          </div>
          <div className="stat-block score-block">
            <p>SCORE</p>
            <strong>{score.toString().padStart(6, "0")}</strong>
          </div>
          <div className="stat-block">
            <p>STREAK</p>
            <strong className="accent">{streak}<small>x</small></strong>
            <span>BEST {bestStreak}</span>
          </div>
        </aside>

        <div className="arena-wrap">
          <div
            className="timeline"
            aria-label={
              selectedStage
                ? `스테이지 시퀀스 ${completedWaves} / ${selectedStage.waves}, 현재 ${currentBpm ?? 0} BPM, 활성 키 ${activeKeys.length}개`
                : "스테이지 선택"
            }
          >
            <div className="timeline-copy">
              <span>
                {selectedStage
                  ? `${selectedStage.code} / ${waveProfile?.sectionName ?? selectedStage.name} / ${currentBpm ?? "—"} BPM / ${activeKeys.length} KEYS`
                  : "SELECT A KEYBOARD SEQUENCE"}
              </span>
              <strong>
                {selectedStage
                  ? `${completedWaves.toString().padStart(2, "0")} / ${selectedStage.waves}`
                  : "— / —"}
              </strong>
            </div>
            <div className="timeline-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className={`arena ${playerThreatened ? "player-threatened" : ""}`}>
            <div
              className={`beat-readout ${readoutState}`}
              role="status"
              aria-live="polite"
            >
              <span
                className={`beat-dot ${hurt ? "impact" : attackState}`}
                aria-hidden="true"
              />
              {dangerLabel}
            </div>

            <div
              className={`keyboard-frame ${zoneShift === "expand" ? "zone-expand" : zoneShift === "contract" ? "zone-contract" : ""}`}
            >
              <div className="keyboard-labels">
                <span className="profile-live">
                  {selectedStage
                    ? `${waveProfile?.sectionName ?? "OPENING"} · ${activeKeys.length} ACTIVE KEYS`
                    : "KEY MAP OFFLINE"}
                </span>
                <span
                  className={`profile-change ${tempoShift === "down" ? "tempo-down" : ""} ${zoneShift === "contract" ? "zone-contract" : ""}`}
                  role="status"
                  aria-live="polite"
                >
                  {selectedStage
                    ? profileChanges || `${currentBpm ?? "—"} BPM · ZONE STABLE`
                    : "NO STAGE"}
                </span>
              </div>
              <div className="keyboard" role="group" aria-label="QWERTY 게임 보드">
                {KEY_ROWS.map((row, rowIndex) => (
                  <div className={`key-row row-${rowIndex}`} key={row.join("")}>
                    {row.map((key) => {
                      const active = activeKeys.includes(key);
                      const targeted = targets.includes(key);
                      const isPlayer = playerKey === key;
                      const isOnlySafe =
                        key === specialKey &&
                        attackKind === "last-safe" &&
                        attackState === "warning";
                      const isHealKey =
                        key === specialKey &&
                        attackKind === "heal" &&
                        (attackState === "warning" || attackState === "impact");
                      const classes = [
                        "key-cap",
                        active ? "active" : "inactive",
                        targeted && attackState === "warning" ? "warning" : "",
                        targeted && attackState === "impact" ? "impact" : "",
                        isOnlySafe ? "only-safe" : "",
                        isHealKey && attackState === "warning" ? "heal-warning" : "",
                        isHealKey && attackState === "impact" ? "heal-impact" : "",
                        isPlayer && active ? "player" : "",
                        isPlayer && targeted && attackState === "warning"
                          ? "player-threatened"
                          : "",
                        isPlayer && playerUnderImpact ? "player-impact" : "",
                        isPlayer && hurt ? "damaged" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <button
                          type="button"
                          tabIndex={-1}
                          disabled={!active}
                          className={classes}
                          key={key}
                          onClick={() => moveTo(key)}
                          aria-label={`${key} 키${active ? "" : ", 비활성"}${isPlayer && active ? ", 현재 위치" : ""}${targeted ? ", 위험" : ""}${isOnlySafe ? ", 유일한 안전 키" : ""}${isHealKey ? ", 회복 키" : ""}`}
                        >
                          <span className="key-letter">{key}</span>
                          <span className="key-code">{key.charCodeAt(0)}</span>
                          {isPlayer && active && (
                            <i className="player-core" aria-hidden="true" />
                          )}
                          {isPlayer && targeted && attackState === "warning" && (
                            <span className="move-callout" aria-hidden="true">
                              MOVE!
                            </span>
                          )}
                          {isPlayer && hurt && (
                            <span className="hit-callout" aria-hidden="true">
                              HIT
                            </span>
                          )}
                          {isOnlySafe && (
                            <span className="safe-callout" aria-hidden="true">
                              ONLY SAFE
                            </span>
                          )}
                          {isHealKey && attackState === "warning" && (
                            <span className="heal-callout" aria-hidden="true">
                              +1 HP
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="keyboard-footer" aria-hidden="true">
                <span>INPUT: <b>KEY_{playerKey}</b></span>
                <span>
                  WAVE: {selectedStage ? `${completedWaves}/${selectedStage.waves}` : "—"}
                </span>
              </div>
            </div>

            {phase === "countdown" && selectedStage && (
              <div className="game-overlay countdown-overlay">
                <div
                  className="countdown-card"
                  style={
                    {
                      "--countdown-beat": `${getBeatMs(selectedStage, 0)}ms`,
                    } as CSSProperties
                  }
                >
                  <p className="overlay-code">
                    {selectedStage.code} / TEMPO SYNC
                  </p>
                  <div
                    className="countdown-number"
                    key={countdownValue}
                    role="status"
                    aria-live="assertive"
                    aria-atomic="true"
                  >
                    {countdownValue}
                  </div>
                  <strong>{getWaveProfile(selectedStage, 0).bpm} BPM · OPENING</strong>
                  <p>오프닝 템포로 3박 카운트 · 이후 구간마다 속도와 키 존이 변합니다.</p>
                  <button
                    type="button"
                    className="countdown-cancel"
                    onClick={cancelCountdown}
                  >
                    <kbd>ESC</kbd> 스테이지 선택으로
                  </button>
                </div>
              </div>
            )}

            {phase !== "running" && phase !== "countdown" && (
              <div className="game-overlay">
                <div className="overlay-card">
                  <p className="overlay-code">{phase.toUpperCase()}</p>
                  <h2>
                    {phase === "paused" && <>일시정지</>}
                    {phase === "won" && <>STAGE<br />CLEARED</>}
                    {phase === "lost" && <>SIGNAL<br />LOST</>}
                  </h2>
                  <p className="overlay-description">
                    {phase === "paused" && "준비되면 ESC를 눌러 계속하세요."}
                    {phase === "won" && selectedStage &&
                      `${selectedStage.code} ${selectedStage.name} 클리어 · ${getStageTempoRange(selectedStage).min}—${getStageTempoRange(selectedStage).max} BPM · 점수 ${score.toLocaleString()} · 최고 연속 회피 ${bestStreak}`}
                    {phase === "lost" && selectedStage &&
                      `${selectedStage.code} ${completedWaves}/${selectedStage.waves} 완료 · 점수 ${score.toLocaleString()}`}
                  </p>
                  <div className="result-actions">
                    <button
                      type="button"
                      className="start-button"
                      onClick={
                        phase === "paused"
                          ? resumeGame
                          : phase === "won" && nextStage
                            ? () => startStage(nextStage.id)
                            : () => selectedStageId && startStage(selectedStageId)
                      }
                    >
                      <span>
                        {phase === "paused"
                          ? "계속하기"
                          : phase === "won" && nextStage
                            ? `${nextStage.code}로 계속`
                            : "같은 스테이지 재도전"}
                      </span>
                      <kbd>{phase === "paused" ? "ESC" : "SPACE / ENTER"}</kbd>
                    </button>
                    {phase === "won" && nextStage && selectedStageId && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => startStage(selectedStageId)}
                      >
                        같은 스테이지 재도전
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={showStageSelect}
                    >
                      스테이지 선택으로
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="guide-panel">
          <p className="panel-title">SEQUENCE RULES</p>
          <ol>
            <li><b>01</b><span><strong>LIVE TEMPO</strong>같은 스테이지 안에서도 감속과 가속 발생</span></li>
            <li><b>02</b><span><strong>ZONE SHIFT</strong>패턴 구간에 따라 활성 키가 확장·축소</span></li>
            <li><b>03</b><span><strong>ONLY SAFE</strong>상위 스테이지는 단 하나의 안전 키로 이동</span></li>
            <li><b>04</b><span><strong>HEAL +1</strong>희귀한 파랑/초록 키를 예고 중 직접 입력</span></li>
          </ol>
          <div className="control-legend">
            <span><kbd>A–Z</kbd> MOVE</span>
            <span><kbd>ESC</kbd> PAUSE</span>
            <span><kbd>0</kbd> SOUND</span>
          </div>
        </aside>
      </section>

      <footer className="game-footer">
        <span>PROTOTYPE BUILD 0.5</span>
        <span className="footer-message">모든 웨이브를 돌파하면 스테이지가 클리어됩니다.</span>
        <span>KEYBOARD EVENT: CODE</span>
      </footer>
    </main>
  );
}
