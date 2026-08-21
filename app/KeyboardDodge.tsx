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
  getImpactHoldMs,
  getStage,
  getStageDurationMs,
  getStageKeyRange,
  getStageSelectionAction,
  getStageTempoRange,
  getZoneTransition,
  getWaveIntensity,
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
  SurfPattern,
  WaveProfile,
  ZoneTransitionPlan,
} from "./gameLogic";
import {
  AudioDirector,
  musicProfileFromWave,
  SCORE_START_LEAD_MS,
} from "./audioDirector";
import { ThemeSettings } from "./ThemeSettings";
import {
  DEFAULT_THEME_ID,
  getTheme,
  type ThemeId,
} from "./themes";
import {
  applyRunResult,
  createEmptyProgress,
  loadProgress,
  saveProgress,
  type LocalProgressV1,
  type NewBestFlags,
  type RankedRun,
  type RunOutcome,
} from "./progress";

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
type PausedAttackMode =
  | "warning"
  | "zone-pending"
  | "zone-warning"
  | "between"
  | "finish";
type ZoneShift = "steady" | "expand" | "contract";
type TempoShift = "steady" | "up" | "down";
type ZoneTransitionPhase = "warning" | "applied";

interface ZoneTransitionView {
  kind: "collapse" | "restore";
  phase: ZoneTransitionPhase;
  keys: readonly string[];
  nextKeyCount: number;
}

interface CollapseEjection {
  fromKey: string;
  toKey: string;
  damaged: boolean;
}

interface RunReport {
  rankedRun: RankedRun;
  newBests: NewBestFlags;
}

interface PausedAttackSchedule {
  stageId: StageId;
  waveIndex: number;
  mode: PausedAttackMode;
  remainingMs: number;
  warningStartedAt: number;
  zoneTransitionPlan: ZoneTransitionPlan | null;
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

function formatStageDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + seconds.toString().padStart(2, "0");
}

function getRunAwardLabels(newBests: NewBestFlags) {
  const labels: string[] = [];
  if (newBests.firstClear) labels.push("FIRST CLEAR");
  if (newBests.grade) labels.push("BEST RATING");
  if (newBests.score) labels.push("HIGH SCORE");
  if (newBests.combo) labels.push("BEST COMBO");
  if (newBests.hp) labels.push("BEST HP");
  if (newBests.waves) labels.push("FARTHEST RUN");
  return labels;
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
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
  const [comboPopStreak, setComboPopStreak] = useState<number | null>(null);
  const [completedWaves, setCompletedWaves] = useState(0);
  const [targets, setTargets] = useState<string[]>([]);
  const [attackState, setAttackState] = useState<AttackState>("idle");
  const [attackKind, setAttackKind] = useState<AttackKind>("standard");
  const [surfPattern, setSurfPattern] = useState<SurfPattern | null>(null);
  const [specialKey, setSpecialKey] = useState<string | null>(null);
  const [healFeedback, setHealFeedback] = useState<HealFeedback>("idle");
  const [hurt, setHurt] = useState(false);
  const [muted, setMuted] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [waveProfile, setWaveProfile] = useState<WaveProfile | null>(null);
  const [runtimeActiveKeys, setRuntimeActiveKeys] = useState<readonly string[]>(
    [],
  );
  const [zoneTransition, setZoneTransition] =
    useState<ZoneTransitionView | null>(null);
  const [zoneShift, setZoneShift] = useState<ZoneShift>("steady");
  const [tempoShift, setTempoShift] = useState<TempoShift>("steady");
  const [collapseEjection, setCollapseEjection] =
    useState<CollapseEjection | null>(null);
  const [localProgress, setLocalProgress] = useState<LocalProgressV1>(() =>
    createEmptyProgress(),
  );
  const [runReport, setRunReport] = useState<RunReport | null>(null);

  const selectedStage = useMemo(
    () => (selectedStageId ? getStage(selectedStageId) : null),
    [selectedStageId],
  );
  const focusedStage = useMemo(
    () => (focusedStageId ? getStage(focusedStageId) : null),
    [focusedStageId],
  );
  const currentTheme = useMemo(() => getTheme(themeId), [themeId]);
  const activeKeys = runtimeActiveKeys;

  const playerKeyRef = useRef(playerKey);
  const phaseRef = useRef(phase);
  const hpRef = useRef(hp);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const progressRef = useRef(localProgress);
  const runIdRef = useRef("");
  const runSerialRef = useRef(0);
  const runEndedRef = useRef(true);
  const invulnerableUntilRef = useRef(0);
  const attackIndexRef = useRef(0);
  const lastInputRef = useRef<InputSnapshot>({ key: "", at: -Infinity });
  const audioRef = useRef<AudioContext | null>(null);
  const audioDirectorRef = useRef<AudioDirector | null>(null);
  const mutedRef = useRef(muted);
  const pausedAttackRef = useRef<PausedAttackSchedule | null>(null);
  const pausedInvulnerabilityRef = useRef(0);
  const countdownStartedAtRef = useRef(0);
  const waveProfileRef = useRef<WaveProfile | null>(null);
  const activeKeysRef = useRef<readonly string[]>([]);
  const stageTrackRef = useRef<HTMLDivElement | null>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storage = getBrowserStorage();
      const storedProgress = storage
        ? loadProgress(storage)
        : createEmptyProgress();
      progressRef.current = storedProgress;
      setLocalProgress(storedProgress);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const awardScore = useCallback((points: number) => {
    const nextScore = Math.max(0, scoreRef.current + points);
    scoreRef.current = nextScore;
    setScore(nextScore);
    return nextScore;
  }, []);

  const completeRun = useCallback(
    (
      stageId: StageId,
      outcome: RunOutcome,
      runCompletedWaves: number,
      finalScore = scoreRef.current,
    ) => {
      if (runEndedRef.current) return null;
      runEndedRef.current = true;

      const commit = applyRunResult(progressRef.current, {
        runId:
          runIdRef.current ||
          `${stageId}-${Date.now()}-${++runSerialRef.current}`,
        stageId,
        outcome,
        completedWaves: runCompletedWaves,
        score: finalScore,
        bestCombo: bestStreakRef.current,
        remainingHp: hpRef.current,
        endedAt: Date.now(),
      });

      progressRef.current = commit.progress;
      setLocalProgress(commit.progress);
      setRunReport({
        rankedRun: commit.rankedRun,
        newBests: commit.newBests,
      });
      const storage = getBrowserStorage();
      if (storage) saveProgress(storage, commit.progress);
      return commit;
    },
    [],
  );

  const applyTheme = useCallback((nextThemeId: ThemeId) => {
    const nextTheme = getTheme(nextThemeId);
    setThemeId(nextTheme.id);
  }, []);

  useEffect(() => {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.style.colorScheme = theme.mode;
  }, [themeId]);

  useEffect(
    () => () => {
      const context = audioRef.current;
      audioRef.current = null;
      if (context && context.state !== "closed") void context.close();
      const director = audioDirectorRef.current;
      audioDirectorRef.current = null;
      if (director) void director.dispose();
    },
    [],
  );

  const getAudioDirector = useCallback(() => {
    const currentDirector = audioDirectorRef.current;
    if (currentDirector) return currentDirector;
    const nextDirector = new AudioDirector();
    nextDirector.setMuted(mutedRef.current);
    audioDirectorRef.current = nextDirector;
    return nextDirector;
  }, []);

  const playTone = useCallback(
    (frequency: number, duration = 0.06, volume = 0.04) => {
      if (mutedRef.current || typeof window === "undefined") return;
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;

      let context = audioRef.current;
      if (!context) {
        try {
          context = new AudioContextClass();
          audioRef.current = context;
        } catch {
          return;
        }
      }

      const emitTone = () => {
        if (mutedRef.current || context.state !== "running") return;
        try {
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
        } catch {
          // Sound effects are optional and must never interrupt game state.
        }
      };

      if (context.state === "suspended") {
        void context.resume().then(emitTone).catch(() => undefined);
      } else {
        emitTone();
      }
    },
    [],
  );

  const toggleMuted = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      mutedRef.current = next;
      audioDirectorRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const applyActiveKeys = useCallback((keys: readonly string[]) => {
    activeKeysRef.current = keys;
    setRuntimeActiveKeys(keys);
  }, []);

  const startStage = useCallback(
    (stageId: StageId) => {
      const stage = getStage(stageId);
      const openingProfile = getWaveProfile(stage, 0);
      setSelectedStageId(stageId);
      setPlayerKey("F");
      playerKeyRef.current = "F";
      setHp(MAX_HP);
      hpRef.current = MAX_HP;
      setScore(0);
      scoreRef.current = 0;
      streakRef.current = 0;
      setStreak(0);
      setComboPopStreak(null);
      setBestStreak(0);
      bestStreakRef.current = 0;
      setRunReport(null);
      setCompletedWaves(0);
      setTargets([]);
      setAttackState("idle");
      setAttackKind("standard");
      setSurfPattern(null);
      setSpecialKey(null);
      setHealFeedback("idle");
      setHurt(false);
      setWaveProfile(openingProfile);
      waveProfileRef.current = openingProfile;
      applyActiveKeys(openingProfile.activeKeys);
      setZoneTransition(null);
      setZoneShift("steady");
      setTempoShift("steady");
      setCollapseEjection(null);
      attackIndexRef.current = 0;
      runSerialRef.current += 1;
      runIdRef.current = `${stageId}-${Date.now()}-${runSerialRef.current}`;
      runEndedRef.current = false;
      invulnerableUntilRef.current = 0;
      lastInputRef.current = { key: "", at: -Infinity };
      pausedAttackRef.current = null;
      pausedInvulnerabilityRef.current = 0;
      countdownStartedAtRef.current =
        performance.now() + SCORE_START_LEAD_MS;
      setCountdownValue(COUNTDOWN_BEATS);
      phaseRef.current = "countdown";
      setPhase("countdown");
      void getAudioDirector().startCountdown(
        musicProfileFromWave(
          stageId,
          openingProfile,
          getWaveIntensity(stage, 0),
        ),
        COUNTDOWN_BEATS,
        countdownStartedAtRef.current,
      );
    },
    [applyActiveKeys, getAudioDirector],
  );

  const showStageSelect = useCallback(() => {
    audioDirectorRef.current?.stop();
    phaseRef.current = "select";
    setPhase("select");
    setSelectedStageId(null);
    setPlayerKey("F");
    playerKeyRef.current = "F";
    setHp(MAX_HP);
    hpRef.current = MAX_HP;
    setScore(0);
    scoreRef.current = 0;
    streakRef.current = 0;
    setStreak(0);
    setComboPopStreak(null);
    setBestStreak(0);
    bestStreakRef.current = 0;
    setRunReport(null);
    setCompletedWaves(0);
    setTargets([]);
    setAttackState("idle");
    setAttackKind("standard");
    setSurfPattern(null);
    setSpecialKey(null);
    setHealFeedback("idle");
    setHurt(false);
    setWaveProfile(null);
    waveProfileRef.current = null;
    applyActiveKeys([]);
    setZoneTransition(null);
    setZoneShift("steady");
    setTempoShift("steady");
    setCollapseEjection(null);
    attackIndexRef.current = 0;
    runIdRef.current = "";
    runEndedRef.current = true;
    invulnerableUntilRef.current = 0;
    lastInputRef.current = { key: "", at: -Infinity };
    pausedAttackRef.current = null;
    pausedInvulnerabilityRef.current = 0;
    setCountdownValue(COUNTDOWN_BEATS);
    setFocusedStageId(null);
  }, [applyActiveKeys]);

  const showTitle = useCallback(() => {
    audioDirectorRef.current?.stop();
    phaseRef.current = "title";
    setPhase("title");
    setSelectedStageId(null);
    setPlayerKey("F");
    playerKeyRef.current = "F";
    setHp(MAX_HP);
    hpRef.current = MAX_HP;
    setScore(0);
    scoreRef.current = 0;
    streakRef.current = 0;
    setStreak(0);
    setComboPopStreak(null);
    setBestStreak(0);
    bestStreakRef.current = 0;
    setRunReport(null);
    setCompletedWaves(0);
    setTargets([]);
    setAttackState("idle");
    setAttackKind("standard");
    setSurfPattern(null);
    setSpecialKey(null);
    setHealFeedback("idle");
    setHurt(false);
    setWaveProfile(null);
    waveProfileRef.current = null;
    applyActiveKeys([]);
    setZoneTransition(null);
    setZoneShift("steady");
    setTempoShift("steady");
    setCollapseEjection(null);
    attackIndexRef.current = 0;
    runIdRef.current = "";
    runEndedRef.current = true;
    invulnerableUntilRef.current = 0;
    lastInputRef.current = { key: "", at: -Infinity };
    pausedAttackRef.current = null;
    pausedInvulnerabilityRef.current = 0;
    setCountdownValue(COUNTDOWN_BEATS);
    setFocusedStageId(null);
  }, [applyActiveKeys]);

  const enterStageSelect = useCallback(() => {
    showStageSelect();
    playTone(340, 0.1, 0.035);
  }, [playTone, showStageSelect]);

  const focusStage = useCallback(
    (stageId: StageId) => {
      setFocusedStageId(stageId);
      playTone(260 + stageId * 70, 0.06, 0.025);
      const stageCard = stageTrackRef.current?.querySelector<HTMLButtonElement>(
        `[data-stage-id="${stageId}"]`,
      );
      if (!stageCard) return;

      stageCard.focus({ preventScroll: true });
      stageCard.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
        inline: "center",
      });
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
    audioDirectorRef.current?.stop();
    phaseRef.current = "select";
    setPhase("select");
    setSelectedStageId(null);
    setFocusedStageId(null);
    setCountdownValue(COUNTDOWN_BEATS);
    setTargets([]);
    setAttackState("idle");
    setAttackKind("standard");
    setSurfPattern(null);
    setSpecialKey(null);
    setHealFeedback("idle");
    setHurt(false);
    setWaveProfile(null);
    waveProfileRef.current = null;
    applyActiveKeys([]);
    setZoneTransition(null);
    setZoneShift("steady");
    setTempoShift("steady");
    setCollapseEjection(null);
  }, [applyActiveKeys]);

  const moveTo = useCallback(
    (key: string) => {
      const currentPhase = phaseRef.current;
      if (
        (currentPhase !== "running" && currentPhase !== "countdown") ||
        !selectedStageId
      ) {
        return;
      }
      if (!activeKeysRef.current.includes(key)) return;

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
    const profile = waveProfileRef.current;
    if (selectedStageId && profile) {
      const stage = getStage(selectedStageId);
      void audioDirectorRef.current?.resume(
        musicProfileFromWave(
          selectedStageId,
          profile,
          getWaveIntensity(stage, profile.waveIndex),
        ),
      );
    } else {
      void audioDirectorRef.current?.resume();
    }
    phaseRef.current = "running";
    setPhase("running");
  }, [selectedStageId]);

  const pauseGame = useCallback(() => {
    pausedInvulnerabilityRef.current = Math.max(
      0,
      invulnerableUntilRef.current - performance.now(),
    );
    phaseRef.current = "paused";
    setPhase("paused");
    setComboPopStreak(null);
    void audioDirectorRef.current?.pause();
  }, []);

  const openThemeSettings = useCallback(() => {
    if (phaseRef.current === "countdown") return;
    if (phaseRef.current === "running") pauseGame();
    settingsReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSettingsOpen(true);
  }, [pauseGame]);

  const closeThemeSettings = useCallback(() => {
    setSettingsOpen(false);
    const returnTarget = settingsReturnFocusRef.current;
    settingsReturnFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (settingsOpen) {
        if (event.code === "Escape") {
          event.preventDefault();
          closeThemeSettings();
        }
        return;
      }

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
            event.code === "ArrowRight" || event.code === "ArrowDown"
              ? 1
              : -1;
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
        if (event.code === "Escape") {
          cancelCountdown();
          return;
        }

        const key = event.code.startsWith("Key") ? event.code.slice(3) : "";
        if (ALL_KEYS.includes(key)) {
          event.preventDefault();
          moveTo(key);
        }
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
    closeThemeSettings,
    chooseStage,
    focusedStageId,
    enterStageSelect,
    focusStage,
    moveTo,
    pauseGame,
    playTone,
    resumeGame,
    selectedStageId,
    settingsOpen,
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
        nextBeatAt += beatMs;
        timer = window.setTimeout(
          advanceCountdown,
          Math.max(0, nextBeatAt - performance.now()),
        );
        return;
      }

      const openingProfile = getWaveProfile(stage, 0);
      void audioDirectorRef.current?.startRun(
        musicProfileFromWave(
          stage.id,
          openingProfile,
          getWaveIntensity(stage, 0),
        ),
      );
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
  }, [phase, selectedStageId]);

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
    let currentZonePlan: ZoneTransitionPlan | null = null;
    let nextImpactAt =
      performance.now() +
      getWaveProfile(stage, attackIndexRef.current).beatMs;

    const finishStage = () => {
      if (cancelled || phaseRef.current !== "running") return;
      scheduleMode = null;
      audioDirectorRef.current?.stop();
      const finalScore = awardScore(hpRef.current * 300 + stage.id * 500);
      completeRun(stage.id, "cleared", stage.waves, finalScore);
      phaseRef.current = "won";
      setComboPopStreak(null);
      setPhase("won");
      playTone(880 + stage.id * 80, 0.28, 0.06);
    };

    const updateProfile = (profile: WaveProfile) => {
      const previousProfile = waveProfileRef.current;
      const nextTempoShift: TempoShift = previousProfile
        ? profile.bpm > previousProfile.bpm
          ? "up"
          : profile.bpm < previousProfile.bpm
            ? "down"
            : "steady"
        : "steady";

      waveProfileRef.current = profile;
      setWaveProfile(profile);
      setTempoShift(nextTempoShift);
      audioDirectorRef.current?.sync(
        musicProfileFromWave(
          stage.id,
          profile,
          getWaveIntensity(stage, profile.waveIndex),
        ),
      );
    };

    function beginZoneTransition(
      plan: ZoneTransitionPlan,
      restoredRemainingMs = plan.warningMs,
      shouldRephaseScore = true,
    ) {
      if (cancelled || phaseRef.current !== "running") return;
      if (plan.kind === "none") return;

      const profile = getWaveProfile(stage, plan.waveIndex);
      const transitionKeys =
        plan.kind === "collapse"
          ? plan.collapsingKeys
          : plan.restoringKeys;
      const transitionKind = plan.kind;
      const now = performance.now();
      const applyAt = now + Math.max(0, restoredRemainingMs);

      currentZonePlan = plan;
      updateProfile(profile);
      if (shouldRephaseScore) {
        audioDirectorRef.current?.rephase(
          musicProfileFromWave(
            stage.id,
            profile,
            getWaveIntensity(stage, profile.waveIndex),
          ),
        );
      }
      setZoneShift(transitionKind === "collapse" ? "contract" : "expand");
      setCollapseEjection(null);
      setZoneTransition({
        kind: transitionKind,
        phase: "warning",
        keys: transitionKeys,
        nextKeyCount: plan.toKeys.length,
      });
      playTone(
        transitionKind === "collapse" ? 126 : 540,
        transitionKind === "collapse" ? 0.18 : 0.14,
        0.04,
      );

      scheduleMode = "zone-warning";
      scheduleDeadlineAt = applyAt;
      nextTimer = window.setTimeout(() => {
        if (cancelled || phaseRef.current !== "running") return;

        const playerKeyAtApply = playerKeyRef.current;
        const zoneEntry = resolveZoneEntry(
          playerKeyAtApply,
          plan.toKeys,
        );
        const playerWasCollapsed =
          transitionKind === "collapse" &&
          plan.collapsingKeys.includes(playerKeyAtApply);
        let fatal = false;

        if (playerWasCollapsed) {
          const collision = resolveCollision(
            plan.collapsingKeys,
            playerKeyAtApply,
            performance.now(),
            invulnerableUntilRef.current,
          );

          if (collision.damaged) {
            invulnerableUntilRef.current = collision.invulnerableUntil;
            const nextHp = Math.max(0, hpRef.current - 1);
            hpRef.current = nextHp;
            setHp(nextHp);
            setHurt(true);
            streakRef.current = 0;
            setStreak(0);
            setComboPopStreak(null);
            fatal = nextHp === 0;
            window.clearTimeout(hurtTimer);
            hurtTimer = window.setTimeout(
              () => setHurt(false),
              INVULNERABILITY_MS,
            );
          }

          setCollapseEjection({
            fromKey: playerKeyAtApply,
            toKey: zoneEntry.playerKey,
            damaged: collision.damaged,
          });
        } else {
          setCollapseEjection(null);
        }

        applyActiveKeys(plan.toKeys);
        if (zoneEntry.recentered) {
          playerKeyRef.current = zoneEntry.playerKey;
          setPlayerKey(zoneEntry.playerKey);
          lastInputRef.current = { key: "", at: -Infinity };
        }

        setZoneTransition({
          kind: transitionKind,
          phase: "applied",
          keys: transitionKeys,
          nextKeyCount: plan.toKeys.length,
        });
        playTone(
          transitionKind === "collapse" ? 74 : 760,
          0.16,
          0.045,
        );
        currentZonePlan = null;

        if (fatal) {
          scheduleMode = null;
          audioDirectorRef.current?.stop();
          completeRun(
            stage.id,
            "game-over",
            attackIndexRef.current,
          );
          phaseRef.current = "lost";
          setPhase("lost");
          playTone(55, 0.35, 0.06);
          return;
        }

        const warningAt =
          applyAt +
          Math.max(0, profile.attackBeats - 1) * profile.beatMs;
        nextImpactAt = warningAt + profile.beatMs;
        scheduleMode = "between";
        scheduleDeadlineAt = warningAt;
        nextTimer = window.setTimeout(
          () => runAttack(),
          Math.max(0, warningAt - performance.now()),
        );
      }, Math.max(0, applyAt - performance.now()));
    }

    function scheduleFollowingWave(
      nextWaveIndex: number,
      previousImpactAt: number,
      previousDangerKeys: readonly string[],
      postImpactHoldMs: number,
    ) {
      const plan = getZoneTransition(
        stage,
        nextWaveIndex,
        activeKeysRef.current,
        previousDangerKeys,
      );

      if (plan.kind !== "none") {
        const transitionStartAt = performance.now() + postImpactHoldMs;
        currentZonePlan = plan;
        scheduleMode = "zone-pending";
        scheduleDeadlineAt = transitionStartAt;
        nextTimer = window.setTimeout(
          () => beginZoneTransition(plan),
          Math.max(0, transitionStartAt - performance.now()),
        );
        return;
      }

      currentZonePlan = null;
      setZoneTransition(null);
      setZoneShift("steady");
      setCollapseEjection(null);
      const nextTiming = getNextWaveTiming(
        stage,
        nextWaveIndex,
        previousImpactAt,
        plan,
      );
      nextImpactAt = nextTiming.impactAt;
      scheduleMode = "between";
      scheduleDeadlineAt = nextTiming.warningAt;
      nextTimer = window.setTimeout(
        () => runAttack(),
        Math.max(0, nextTiming.warningAt - performance.now()),
      );
    }

    function runAttack(restoredWarningStartedAt?: number) {
      if (cancelled || phaseRef.current !== "running") return;
      const waveIndex = attackIndexRef.current;
      const profile = getWaveProfile(stage, waveIndex);

      updateProfile(profile);
      currentZonePlan = null;
      setZoneTransition(null);
      setZoneShift("steady");
      setCollapseEjection(null);

      const pattern = getAttackPattern(
        waveIndex,
        stage,
        activeKeysRef.current,
      );
      warningStartedAt = restoredWarningStartedAt ?? performance.now();
      const playerIsTargeted = pattern.targets.includes(playerKeyRef.current);
      const waveVisualToken = ++visualToken;

      scheduleMode = "warning";
      scheduleDeadlineAt = nextImpactAt;

      setTargets(pattern.targets);
      setAttackKind(pattern.kind);
      setSurfPattern(pattern.surf);
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
            awardScore(result.full ? 150 : 300);
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
              streakRef.current = 0;
              setStreak(0);
              setComboPopStreak(null);
              fatal = nextHp === 0;
              hurtTimer = window.setTimeout(
                () => setHurt(false),
                INVULNERABILITY_MS,
              );
            }
          } else {
            const nextStreak = streakRef.current + 1;
            streakRef.current = nextStreak;
            setStreak(nextStreak);
            setComboPopStreak(nextStreak);
            playTone(
              620 + Math.min(nextStreak, 12) * 12,
              0.045,
              0.018,
            );
            const nextBestStreak = Math.max(
              bestStreakRef.current,
              nextStreak,
            );
            bestStreakRef.current = nextBestStreak;
            setBestStreak(nextBestStreak);
            awardScore(
              (pattern.kind === "last-safe" ? 220 : 100) +
                Math.min(nextStreak, 20) * 10,
            );
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
          setSurfPattern(null);
          setSpecialKey(null);
        }, getImpactHoldMs(profile.beatMs));

        if (fatal) {
          audioDirectorRef.current?.stop();
          completeRun(stage.id, "game-over", nextCompleted);
          phaseRef.current = "lost";
          setPhase("lost");
          playTone(55, 0.35, 0.06);
          return;
        }

        if (nextCompleted >= stage.waves) {
          scheduleMode = "finish";
          scheduleDeadlineAt = performance.now() + 220;
          finishTimer = window.setTimeout(finishStage, 220);
          return;
        }

        scheduleFollowingWave(
          nextCompleted,
          nextImpactAt,
          pattern.targets,
          getImpactHoldMs(profile.beatMs),
        );
      }, Math.max(0, nextImpactAt - performance.now()));
    }

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
      } else if (
        pausedSchedule.mode === "zone-pending" &&
        pausedSchedule.zoneTransitionPlan
      ) {
        const transitionStartAt =
          performance.now() + pausedSchedule.remainingMs;
        currentZonePlan = pausedSchedule.zoneTransitionPlan;
        scheduleMode = "zone-pending";
        scheduleDeadlineAt = transitionStartAt;
        nextTimer = window.setTimeout(
          () => beginZoneTransition(pausedSchedule.zoneTransitionPlan!),
          pausedSchedule.remainingMs,
        );
      } else if (
        pausedSchedule.mode === "zone-warning" &&
        pausedSchedule.zoneTransitionPlan
      ) {
        beginZoneTransition(
          pausedSchedule.zoneTransitionPlan,
          pausedSchedule.remainingMs,
          false,
        );
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
          zoneTransitionPlan:
            scheduleMode === "zone-warning" ||
            scheduleMode === "zone-pending"
              ? currentZonePlan
              : null,
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
      setSurfPattern(null);
      setSpecialKey(null);
      setHealFeedback("idle");
      setHurt(false);
      if (phaseRef.current !== "paused") {
        setZoneTransition(null);
        setZoneShift("steady");
      }
    };
  }, [
    applyActiveKeys,
    awardScore,
    completeRun,
    phase,
    playTone,
    selectedStageId,
  ]);

  const progress = selectedStage
    ? (completedWaves / selectedStage.waves) * 100
    : 0;
  const selectedStageIndex = selectedStage
    ? STAGES.findIndex((stage) => stage.id === selectedStage.id)
    : -1;
  const nextStage =
    selectedStageIndex >= 0 ? (STAGES[selectedStageIndex + 1] ?? null) : null;
  const clearedStageCount = STAGES.filter(
    (stage) => localProgress.stages[stage.id].clears > 0,
  ).length;
  const focusedStageRecord = focusedStage
    ? localProgress.stages[focusedStage.id]
    : null;
  const runAwardLabels = runReport
    ? getRunAwardLabels(runReport.newBests)
    : [];
  const currentBpm = waveProfile?.bpm ?? null;
  const transitionKeys = zoneTransition?.keys ?? [];
  const transitionWarning = zoneTransition?.phase === "warning";
  const playerOnCollapsingKey =
    transitionWarning &&
    zoneTransition?.kind === "collapse" &&
    transitionKeys.includes(playerKey);
  const transitionLabel = zoneTransition
    ? zoneTransition.kind === "collapse"
      ? zoneTransition.phase === "warning"
        ? "COLLAPSE WARNING · " +
          transitionKeys.length +
          (transitionKeys.length === 1 ? " KEY MARKED" : " KEYS MARKED")
        : "FIELD COLLAPSED · " +
          zoneTransition.nextKeyCount +
          " KEYS ACTIVE"
      : zoneTransition.phase === "warning"
        ? "RESTORE WARNING · " +
          transitionKeys.length +
          (transitionKeys.length === 1
            ? " KEY CHARGING"
            : " KEYS CHARGING")
        : "ZONE RESTORED · " +
          zoneTransition.nextKeyCount +
          " KEYS ACTIVE"
    : "";
  const profileChanges = [
    tempoShift === "up"
      ? "TEMPO UP"
      : tempoShift === "down"
        ? "TEMPO DOWN"
        : "",
    transitionLabel,
    collapseEjection
      ? `COLLAPSE EJECT · KEY_${collapseEjection.fromKey} → KEY_${collapseEjection.toKey}${collapseEjection.damaged ? " · HP -1" : " · INVULNERABLE"}`
      : "",
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
  const surfWarning = attackState === "warning" && surfPattern !== null;
  const surfDirectionArrow =
    surfPattern?.direction === "right-to-left" ? "←" : "→";
  const surfDirectionCopy =
    surfPattern?.direction === "right-to-left" ? "오른쪽에서 왼쪽" : "왼쪽에서 오른쪽";
  const readoutState = hurt
    ? "hit"
    : zoneTransition?.kind === "collapse"
      ? "collapse"
      : zoneTransition?.kind === "restore"
        ? "restore"
        : healWarning || healFeedback === "success" || healFeedback === "full"
          ? "heal"
          : healFeedback === "miss"
            ? "miss"
            : playerThreatened
              ? "danger"
              : surfWarning
                ? "surf"
              : attackState === "warning"
                ? "safe"
                : "";
  const beatDotState = hurt
    ? "impact"
    : transitionWarning
      ? zoneTransition?.kind === "collapse"
        ? "collapse-warning"
        : "restore-warning"
      : surfWarning
        ? "surf-warning"
      : attackState;
  const dangerLabel = hurt
    ? collapseEjection?.damaged
      ? `COLLAPSE HIT! · KEY_${collapseEjection.fromKey} 붕괴 · KEY_${collapseEjection.toKey}로 밀려남 · HP ${hp}/${MAX_HP}`
      : `HIT! · KEY_${playerKey} 피격 · HP ${hp}/${MAX_HP}`
    : transitionWarning && zoneTransition?.kind === "collapse"
      ? playerOnCollapsingKey
        ? `KEY_${playerKey} 붕괴 예정 · 경고가 끝나기 전에 이동하세요`
        : `COLLAPSE WARNING · 직전 위험 키 ${transitionKeys.length}개가 곧 사라집니다`
      : transitionWarning && zoneTransition?.kind === "restore"
        ? `RESTORE WARNING · 비활성 키 ${transitionKeys.length}개가 곧 열립니다`
        : collapseEjection
          ? `COLLAPSE EJECT · KEY_${collapseEjection.toKey}로 이동${collapseEjection.damaged ? " · HP -1" : " · 무적 유지"}`
          : zoneTransition?.kind === "collapse"
            ? `FIELD COLLAPSED · ${zoneTransition.nextKeyCount}개 키로 계속`
          : zoneTransition?.kind === "restore"
            ? `ZONE RESTORED · ${zoneTransition.nextKeyCount}개 키 사용 가능`
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
              : surfWarning && surfPattern
                ? `WAVE SURGE ${surfDirectionArrow} · ${surfDirectionCopy} ${surfPattern.step + 1}/${surfPattern.totalSteps}${playerThreatened ? ` · KEY_${playerKey} MOVE!` : ` · KEY_${playerKey} 안전`}`
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
      <>
      <main className="entry-shell title-entry" data-theme={themeId}>
        <div className="ambient-grid" aria-hidden="true" />
        <header className="screen-chrome">
          <span className="screen-chrome-dots" aria-hidden="true"><i /><i /><i /></span>
          <strong>{currentTheme.displayName.toUpperCase()} INTERFACE</strong>
          <span>TITLE // 00</span>
          <button
            className="theme-settings-trigger"
            type="button"
            onClick={openThemeSettings}
            aria-haspopup="dialog"
          >
            THEME
          </button>
        </header>

        <section className="title-hero" aria-labelledby="game-title">
          <p className="title-kicker">QWERTY RHYTHM ACTION</p>
          <h1 id="game-title" className="title-logo">
            <span>KEYBOARD</span><span className="title-logo-accent">DODGE</span>
          </h1>
          <p className="title-system-line">QWERTY RHYTHM DODGE</p>
          <p className="title-copy">
            실제 키보드를 전장으로 바꾸세요.<br />
            감속·가속 신호와 확장·축소되는 키 존을 읽고 스테이지를 돌파합니다.
          </p>

          <button className="title-start" type="button" onClick={enterStageSelect}>
            <span>게임 시작</span>
            <kbd>SPACE / ENTER</kbd>
          </button>
          <p className="title-hint">물리 키보드가 있는 데스크톱 환경을 권장합니다.</p>
        </section>

        <div className="title-corner bottom-left" aria-hidden="true">KEY//DODGE</div>
        <div className="title-corner bottom-right" aria-hidden="true">PRESS START</div>
      </main>
      <ThemeSettings
        open={settingsOpen}
        selectedThemeId={themeId}
        onSelect={applyTheme}
        onClose={closeThemeSettings}
      />
      </>
    );
  }

  if (phase === "select") {
    return (
      <>
      <main className="entry-shell stage-select-shell" data-theme={themeId}>
        <div className="ambient-grid" aria-hidden="true" />
        <header className="stage-select-topbar">
          <button className="back-button" type="button" onClick={showTitle}>
            <kbd>ESC</kbd> TITLE
          </button>
          <div className="stage-select-brand">
            KEY<span>{"//"}</span>DODGE
          </div>
          <div className="stage-select-actions topbar-actions">
            <button
              className="theme-settings-trigger"
              type="button"
              onClick={openThemeSettings}
              aria-haspopup="dialog"
              aria-label={`테마 설정, 현재 ${currentTheme.displayName}`}
            >
              THEME<span aria-hidden="true"> / {currentTheme.displayName}</span>
            </button>
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

        <section className="stage-map-shell" aria-labelledby="stage-map-title">
          <div className="stage-map-intro">
            <p className="overlay-code">SELECT YOUR RUN</p>
            <h2 id="stage-map-title">스테이지<br />선택</h2>
            <p id="stage-selection-instructions">
              Q부터 Y까지 한 번 누르면 스테이지가 강조됩니다. 같은 키를 한 번
              더 눌러 확정하세요. 각 스테이지는 약 2분 동안 BPM과 활성 키 존이
              공격 흐름에 맞춰 변합니다.
            </p>
            <div className="stage-controls" aria-label="스테이지 선택 조작">
              <span><kbd>QWERTY</kbd> FOCUS / CONFIRM</span>
              <span><kbd>ARROWS</kbd> FOCUS</span>
              <span><kbd>ENTER</kbd> CONFIRM</span>
            </div>
          </div>

          <div className="stage-carousel">
            <div className="stage-carousel-head" aria-live="polite">
              <strong>
                {focusedStage
                  ? `${focusedStage.code} / ${focusedStage.name}`
                  : "MISSION DECK / 06"}
              </strong>
              <span>
                {focusedStage && focusedStageRecord
                  ? focusedStageRecord.attempts > 0
                    ? `BEST ${focusedStageRecord.bestGrade ?? "—"} · ${focusedStageRecord.bestScore.toLocaleString()}`
                    : "NEW MISSION · PRESS AGAIN"
                  : `${clearedStageCount}/06 CLEARED · ALL OPEN`}
              </span>
            </div>

            <div
              ref={stageTrackRef}
              className={`stage-track ${focusedStageId ? "has-focus" : ""}`}
              aria-label="왼쪽부터 오른쪽으로 이어지는 스테이지 카드 목록"
              aria-describedby="stage-selection-instructions"
            >
              {STAGES.map((stage) => {
                const focused = focusedStageId === stage.id;
                const keyRange = getStageKeyRange(stage);
                const tempoRange = getStageTempoRange(stage);
                const stageRecord = localProgress.stages[stage.id];
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
                    <span
                      className={`stage-record ${stageRecord.clears > 0 ? "has-clear" : ""}`}
                    >
                      {stageRecord.clears > 0
                        ? `CLEAR ×${stageRecord.clears} · BEST ${stageRecord.bestGrade ?? "—"}`
                        : stageRecord.attempts > 0
                          ? `BEST ${stageRecord.bestCompletedWaves}/${stage.waves} · ${stageRecord.bestGrade ?? "—"}`
                          : "NEW MISSION · ALL STAGES OPEN"}
                    </span>
                    <span className="stage-metrics">
                      <b>{keyRange.min}↔{keyRange.max}<small> KEYS</small></b>
                      <b>{stage.waves}<small> WAVES</small></b>
                      <b>{tempoRange.min}—{tempoRange.max}<small> BPM</small></b>
                      <b>{formatStageDuration(getStageDurationMs(stage))}<small> RUN</small></b>
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

            <div className="stage-deck-index" aria-hidden="true">
              {STAGES.map((stage) => (
                <span
                  className={focusedStageId === stage.id ? "is-focused" : ""}
                  key={stage.id}
                >
                  {stage.selectKey}
                </span>
              ))}
            </div>
          </div>
        </section>

        <footer className="stage-select-footer">
          <span>
            {focusedStage
              ? `${focusedStage.code} ARMED · ${focusedStageRecord?.attempts ?? 0} RUNS · ${focusedStageRecord?.clears ?? 0} CLEARS`
              : `${clearedStageCount}/06 CLEARED · PRESS Q / W / E / R / T / Y`}
          </span>
          <span>FIRST PRESS = FOCUS · SECOND PRESS = START</span>
        </footer>
      </main>
      <ThemeSettings
        open={settingsOpen}
        selectedThemeId={themeId}
        onSelect={applyTheme}
        onClose={closeThemeSettings}
      />
      </>
    );
  }

  return (
    <>
    <main
      className={`game-shell ${hurt ? "is-hurt" : ""} ${playerThreatened ? "is-threatened" : ""} ${playerOnCollapsingKey ? "is-zone-threatened" : ""} ${waveProfile && selectedStage && waveProfile.sectionIndex === selectedStage.sections.length - 1 ? "is-final-act" : ""}`}
      data-theme={themeId}
      style={
        {
          "--current-beat": `${waveProfile?.beatMs ?? 500}ms`,
          "--warning-pulse": `${(waveProfile?.beatMs ?? 500) / 2}ms`,
          "--stage-identity": selectedStage
            ? `var(--theme-stage-${selectedStage.id})`
            : "var(--theme-accent)",
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
            {phase === "running"
              ? "RUN"
              : phase === "countdown"
                ? "READY"
                : phase === "paused"
                  ? "PAUSED"
                  : "RESULT"}
          </span>
          <button
            className="theme-settings-trigger"
            type="button"
            onClick={openThemeSettings}
            disabled={phase === "countdown"}
            aria-haspopup="dialog"
            aria-label={`테마 설정, 현재 ${currentTheme.displayName}`}
            title={phase === "countdown" ? "카운트다운 뒤 설정할 수 있습니다" : undefined}
          >
            THEME<span aria-hidden="true"> / {currentTheme.displayName}</span>
          </button>
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

      <section className="instrument-hud" aria-label="현재 스테이지 상태">
        <div className="hud-cell">
          <span className="hud-cell-label">COMBO</span>
          <strong className="hud-cell-value">
            ×{streak}<small> BEST {bestStreak}</small>
          </strong>
        </div>
        <div className="hud-cell">
          <span className="hud-cell-label">WAVE</span>
          <strong className="hud-cell-value">
            {completedWaves.toString().padStart(2, "0")} / {selectedStage?.waves ?? "—"}
          </strong>
        </div>
        <div className="hud-cell">
          <span className="hud-cell-label">SCORE</span>
          <strong className="hud-cell-value">{score.toString().padStart(6, "0")}</strong>
        </div>
        <div className="hud-cell hud-health">
          <span className="hud-cell-label">HP</span>
          <strong className="hud-cell-value" aria-label={`체력 ${hp} / ${MAX_HP}`}>
            {Array.from({ length: MAX_HP }).map((_, index) => (
              <i key={index} className={index < hp ? "filled" : ""} aria-hidden="true" />
            ))}
          </strong>
        </div>
        <div className="hud-cell">
          <span className="hud-cell-label">BPM</span>
          <strong className="hud-cell-value">{currentBpm ?? "—"}</strong>
        </div>
        <div className="hud-cell hud-section">
          <span className="hud-cell-label">SECTION</span>
          <strong className="hud-cell-value">
            {waveProfile?.sectionName ?? "OPENING"}<small> SCORE SYNC</small>
          </strong>
        </div>
        <div className="hud-cell">
          <span className="hud-cell-label">ACTIVE ZONE</span>
          <strong className="hud-cell-value">{activeKeys.length}<small> KEYS</small></strong>
        </div>
        <div className="hud-cell hud-progress">
          <span className="hud-cell-label">REMAINING</span>
          <strong className="hud-cell-value">{Math.max(0, Math.round(100 - progress))}%</strong>
          <span className="hud-progress-track" aria-hidden="true">
            <i className="hud-progress-fill" style={{ width: `${progress}%` }} />
          </span>
          {phase === "running" && comboPopStreak !== null && (
            <div
              className="combo-pop"
              key={`combo-${comboPopStreak}`}
              role="status"
              aria-live="polite"
              onAnimationEnd={() => {
                setComboPopStreak((visibleStreak) =>
                  visibleStreak === comboPopStreak ? null : visibleStreak,
                );
              }}
            >
              <small>PERFECT DODGE</small>
              <strong>{comboPopStreak} COMBO!</strong>
            </div>
          )}
        </div>
      </section>

      <section className="play-layout" aria-label="게임 화면">
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
            {phase === "running" &&
              waveProfile?.isSectionStart &&
              waveProfile.waveIndex === completedWaves &&
              completedWaves > 0 &&
              selectedStage && (
                <div
                  className={`act-transition ${waveProfile.sectionIndex === selectedStage.sections.length - 1 ? "is-finale" : ""}`}
                  role="status"
                  aria-live="polite"
                >
                  <span>ACT {waveProfile.sectionIndex + 1} / {selectedStage.sections.length}</span>
                  <strong>{waveProfile.sectionName}</strong>
                  <em>
                    {waveProfile.sectionIndex === selectedStage.sections.length - 1
                      ? "FINAL SEQUENCE"
                      : tempoShift === "up"
                        ? "TEMPO RISING"
                        : tempoShift === "down"
                          ? "TEMPO BREAK"
                          : "FIELD SHIFT"}
                  </em>
                </div>
              )}
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
                className={`beat-dot ${beatDotState}`}
                aria-hidden="true"
              />
              {dangerLabel}
            </div>

            <div
              className={`keyboard-frame ${zoneShift === "expand" ? "zone-expand" : zoneShift === "contract" ? "zone-contract" : ""} ${zoneTransition ? `zone-transition-${zoneTransition.kind} zone-${zoneTransition.phase}` : ""} ${surfWarning && surfPattern ? `surf-warning surf-${surfPattern.direction}` : ""}`}
              data-surf-step={surfWarning && surfPattern ? surfPattern.step + 1 : undefined}
              style={
                surfWarning && surfPattern
                  ? ({
                      "--surf-left": `${surfPattern.leftPercent}%`,
                      "--surf-width": `${surfPattern.widthPercent}%`,
                    } as CSSProperties)
                  : undefined
              }
            >
              {phase === "countdown" && selectedStage && (
                <div
                  className="countdown-badge"
                  style={
                    {
                      "--countdown-beat": `${getBeatMs(selectedStage, 0)}ms`,
                    } as CSSProperties
                  }
                  role="group"
                  aria-label="시작 전 준비 이동, 현재 활성 키로 위치를 정할 수 있습니다"
                >
                  <span className="countdown-copy" aria-hidden="true">
                    <b>{selectedStage.code}</b>
                    <small>PREP MOVE</small>
                  </span>
                  <strong
                    className="countdown-number"
                    key={countdownValue}
                    role="status"
                    aria-live="assertive"
                    aria-atomic="true"
                    aria-label={`게임 시작까지 ${countdownValue}박`}
                  >
                    {countdownValue}
                  </strong>
                  <span className="countdown-copy countdown-tempo" aria-hidden="true">
                    <b>{getWaveProfile(selectedStage, 0).bpm} BPM</b>
                    <small>ACTIVE KEYS MOVE</small>
                  </span>
                  <button
                    type="button"
                    className="countdown-cancel"
                    onClick={cancelCountdown}
                    aria-label="카운트다운 취소하고 스테이지 선택으로 돌아가기"
                  >
                    <kbd>ESC</kbd>
                  </button>
                </div>
              )}
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
                {surfWarning && surfPattern && (
                  <span className="surf-signal" aria-hidden="true">
                    <i />
                  </span>
                )}
                {KEY_ROWS.map((row, rowIndex) => (
                  <div className={`key-row row-${rowIndex}`} key={row.join("")}>
                    {row.map((key) => {
                      const active = activeKeys.includes(key);
                      const targeted = targets.includes(key);
                      const isPlayer = playerKey === key;
                      const isTransitionKey = transitionKeys.includes(key);
                      const isCollapsing =
                        isTransitionKey &&
                        zoneTransition?.kind === "collapse";
                      const isRestoring =
                        isTransitionKey &&
                        zoneTransition?.kind === "restore";
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
                        isCollapsing && transitionWarning
                          ? "collapse-warning"
                          : "",
                        isCollapsing && !transitionWarning
                          ? "collapse-applied"
                          : "",
                        isRestoring && transitionWarning
                          ? "restore-warning"
                          : "",
                        isRestoring && !transitionWarning
                          ? "restore-applied"
                          : "",
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
                          aria-label={`${key} 키${active ? "" : ", 비활성"}${isPlayer && active ? ", 현재 위치" : ""}${targeted ? ", 위험" : ""}${isOnlySafe ? ", 유일한 안전 키" : ""}${isHealKey ? ", 회복 키" : ""}${isCollapsing ? (transitionWarning ? ", 붕괴 예정" : ", 붕괴됨") : ""}${isRestoring ? (transitionWarning ? ", 복원 예정" : ", 복원됨") : ""}`}
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
                          {isCollapsing && transitionWarning && (
                            <span className="collapse-callout" aria-hidden="true">
                              COLLAPSE
                            </span>
                          )}
                          {isRestoring && transitionWarning && (
                            <span className="restore-callout" aria-hidden="true">
                              RESTORE
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

            {phase !== "running" && phase !== "countdown" && (
              <div className="game-overlay">
                <div
                  className={`overlay-card ${phase === "won" || phase === "lost" ? "has-run-report" : ""} ${phase === "won" ? "is-cleared" : phase === "lost" ? "is-failed" : ""}`}
                >
                  <p className="overlay-code">{phase.toUpperCase()}</p>
                  <h2>
                    {phase === "paused" && <>일시정지</>}
                    {phase === "won" && <>STAGE<br />CLEARED</>}
                    {phase === "lost" && <>SIGNAL<br />LOST</>}
                  </h2>
                  <p className="overlay-description">
                    {phase === "paused" && "준비되면 ESC를 눌러 계속하세요."}
                    {phase === "won" && selectedStage &&
                      `${selectedStage.code} ${selectedStage.name}의 모든 ACT를 돌파했습니다.`}
                    {phase === "lost" && selectedStage &&
                      `${selectedStage.code} ${completedWaves}/${selectedStage.waves}까지 도달했습니다. 기록을 확인하고 다시 출격하세요.`}
                  </p>
                  {(phase === "won" || phase === "lost") && runReport && (
                    <section
                      className={`run-report grade-${runReport.rankedRun.grade.toLowerCase()}`}
                      aria-label="런 결과"
                    >
                      <div className="run-grade">
                        <span>RUN GRADE</span>
                        <strong>{runReport.rankedRun.grade}</strong>
                        <small>{runReport.rankedRun.rating} / 100</small>
                      </div>
                      <dl className="run-report-stats">
                        <div>
                          <dt>SCORE</dt>
                          <dd>{runReport.rankedRun.score.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>BEST COMBO</dt>
                          <dd>{runReport.rankedRun.bestCombo}</dd>
                        </div>
                        <div>
                          <dt>HP LEFT</dt>
                          <dd>{runReport.rankedRun.remainingHp} / {MAX_HP}</dd>
                        </div>
                        <div>
                          <dt>WAVES</dt>
                          <dd>
                            {runReport.rankedRun.completedWaves} / {selectedStage?.waves ?? "—"}
                          </dd>
                        </div>
                      </dl>
                      <div className="run-awards" aria-label="새 기록">
                        {(runAwardLabels.length > 0
                          ? runAwardLabels
                          : ["RUN RECORDED"]
                        ).map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                      {phase === "won" && nextStage && (
                        <p className="run-next-mission">
                          NEXT MISSION · {nextStage.code} {nextStage.name}
                        </p>
                      )}
                    </section>
                  )}
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
      </section>

      <footer className="game-footer">
        <span>{selectedStage ? `${selectedStage.code} · ${selectedStage.name}` : "KEY//DODGE"}</span>
        <span className="footer-message">ORIGINAL PROCEDURAL SCORE · A–Z MOVE · ESC PAUSE · 0 SOUND</span>
        <span>PHYSICAL INPUT MODE</span>
      </footer>
    </main>
    <ThemeSettings
      open={settingsOpen}
      selectedThemeId={themeId}
      onSelect={applyTheme}
      onClose={closeThemeSettings}
    />
    </>
  );
}
