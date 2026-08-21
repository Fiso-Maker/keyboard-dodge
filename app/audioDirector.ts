/**
 * KEY//DODGE procedural soundtrack.
 *
 * Every audible element is synthesized in the browser from the event patterns
 * in this file. No third-party recordings, samples, or compositions are used.
 * The game remains the source of truth for combat timing: this director follows
 * the supplied wave profile and never advances attacks or collision state.
 */

import type { StageId, WaveProfile } from "./gameLogic.ts";

export const PROCEDURAL_AUDIO_NOTICE =
  "Original procedural soundtrack: synthesized at runtime with no third-party audio assets.";

export type MusicInstrument =
  | "kick"
  | "pulse"
  | "hat"
  | "bass"
  | "motif";

export interface MusicProfile {
  stageId: StageId;
  bpm: number;
  sectionIndex: number;
  intensity: number;
  waveIndex: number;
}

export interface MusicEvent {
  instrument: MusicInstrument;
  /** Sixteenth-note position inside a four-beat bar. */
  step: number;
  durationSteps: number;
  velocity: number;
  /** MIDI note number. Rhythmic noise instruments do not need one. */
  note?: number;
}

export interface ScheduledMusicEvent extends MusicEvent {
  /** Absolute AudioContext time in seconds. */
  at: number;
  durationSeconds: number;
}

export interface CountdownSchedule {
  started: boolean;
  /** Absolute AudioContext times. Empty when audio is unavailable. */
  beatTimes: readonly number[];
}

export interface AudioDirectorOptions {
  /** How often the score scheduler wakes up. */
  lookAheadMs?: number;
  /** Amount of audio placed ahead on the AudioContext timeline. */
  scheduleAheadSeconds?: number;
  /** Useful for tests or alternate browser shells. */
  contextFactory?: () => AudioContext | null;
}

const STEPS_PER_BEAT = 4;
const STEPS_PER_BAR = 16;
const MIN_BPM = 40;
const MAX_BPM = 240;
export const SCORE_START_LEAD_MS = 24;
const START_LATENCY_SECONDS = SCORE_START_LEAD_MS / 1_000;
const RESUME_LATENCY_SECONDS = 0.006;
const SILENCE = 0.0001;

const STAGE_ROOTS: Readonly<Record<StageId, number>> = {
  1: 38, // D2
  2: 40, // E2
  3: 42, // F#2
  4: 43, // G2
  5: 45, // A2
  6: 36, // C2
};

const STAGE_SCALES: Readonly<Record<StageId, readonly number[]>> = {
  1: [0, 3, 5, 7, 10],
  2: [0, 2, 3, 5, 7, 9, 10],
  3: [0, 2, 3, 5, 7, 8, 10],
  4: [0, 2, 3, 5, 7, 9, 10],
  5: [0, 1, 3, 5, 7, 8, 10],
  6: [0, 2, 3, 5, 7, 8, 11],
};

const STAGE_MOTIFS: Readonly<Record<StageId, readonly number[]>> = {
  1: [0, 2, 1, 3, 2, 4, 3, 1],
  2: [0, 1, 3, 2, 4, 3, 5, 2],
  3: [0, 3, 1, 4, 2, 5, 3, 1],
  4: [0, 2, 4, 1, 3, 5, 2, 4],
  5: [0, 1, 4, 2, 3, 1, 5, 4],
  6: [0, 4, 2, 5, 3, 1, 6, 4],
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function integer(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function uniqueSteps(steps: readonly number[]) {
  return [...new Set(steps.map((step) => clamp(integer(step), 0, 15)))];
}

export function normalizeMusicProfile(profile: MusicProfile): MusicProfile {
  const stageId = clamp(integer(profile.stageId, 1), 1, 6) as StageId;
  return {
    stageId,
    bpm: clamp(Number.isFinite(profile.bpm) ? profile.bpm : 120, MIN_BPM, MAX_BPM),
    sectionIndex: clamp(integer(profile.sectionIndex), 0, 3),
    intensity: clamp(integer(profile.intensity, 1), 1, 4),
    waveIndex: Math.max(0, integer(profile.waveIndex)),
  };
}

export function musicProfileFromWave(
  stageId: StageId,
  profile: Pick<
    WaveProfile,
    "bpm" | "sectionIndex" | "waveIndex"
  >,
  intensity: number,
): MusicProfile {
  return normalizeMusicProfile({
    stageId,
    bpm: profile.bpm,
    sectionIndex: profile.sectionIndex,
    intensity,
    waveIndex: profile.waveIndex,
  });
}

export function getStepDurationSeconds(bpm: number) {
  const safeBpm = clamp(Number.isFinite(bpm) ? bpm : 120, MIN_BPM, MAX_BPM);
  return 60 / safeBpm / STEPS_PER_BEAT;
}

function getKickSteps(sectionIndex: number, intensity: number) {
  if (sectionIndex === 0) {
    return intensity >= 2 ? [0, 6, 8, 14] : [0, 8];
  }
  if (sectionIndex === 1) {
    return intensity >= 3 ? [0, 3, 6, 8, 11, 14] : [0, 6, 8, 14];
  }
  if (sectionIndex === 2) {
    return intensity >= 3 ? [0, 7, 8, 15] : [0, 8];
  }
  return intensity >= 3 ? [0, 3, 6, 8, 10, 14] : [0, 4, 8, 12];
}

function getBassSteps(sectionIndex: number, intensity: number) {
  if (sectionIndex === 0) return intensity >= 2 ? [0, 6, 8, 14] : [0, 8];
  if (sectionIndex === 1) return [0, 4, 7, 10, 12, 15];
  if (sectionIndex === 2) return intensity >= 3 ? [0, 7, 10] : [0, 8];
  return [0, 3, 6, 8, 11, 14];
}

function getMotifSteps(sectionIndex: number, intensity: number, barIndex: number) {
  if (sectionIndex === 0 && barIndex % 2 === 1) return [];
  if (sectionIndex === 2) return barIndex % 2 === 0 ? [2, 6, 10, 14] : [];
  if (sectionIndex === 3 && intensity >= 3) return [1, 3, 5, 7, 9, 11, 13, 15];
  return [2, 6, 10, 14];
}

/**
 * Builds one deterministic four-beat phrase. Bar plans are pure data, making
 * the musical timing testable without constructing an AudioContext.
 */
export function createBarPlan(
  rawProfile: MusicProfile,
  rawBarIndex: number,
): readonly MusicEvent[] {
  const profile = normalizeMusicProfile(rawProfile);
  const barIndex = Math.max(0, integer(rawBarIndex));
  const root = STAGE_ROOTS[profile.stageId];
  const scale = STAGE_SCALES[profile.stageId];
  const motif = STAGE_MOTIFS[profile.stageId];
  const events: MusicEvent[] = [];

  for (const step of uniqueSteps(getKickSteps(profile.sectionIndex, profile.intensity))) {
    events.push({
      instrument: "kick",
      step,
      durationSteps: 2,
      velocity: step === 0 ? 1 : 0.82,
    });
  }

  const pulseSteps =
    profile.sectionIndex === 2 && profile.intensity < 3 ? [8] : [4, 12];
  for (const step of pulseSteps) {
    events.push({
      instrument: "pulse",
      step,
      durationSteps: 1,
      velocity: profile.sectionIndex === 3 ? 0.78 : 0.64,
    });
  }

  const hatStride =
    profile.sectionIndex === 3 || profile.intensity >= 3 ? 1 : 2;
  const hatOffset = profile.sectionIndex === 2 ? 1 : 0;
  for (let step = hatOffset; step < STEPS_PER_BAR; step += hatStride) {
    events.push({
      instrument: "hat",
      step,
      durationSteps: 0.45,
      velocity: step % 4 === 0 ? 0.38 : 0.24,
    });
  }

  const bassSteps = getBassSteps(profile.sectionIndex, profile.intensity);
  for (const [noteIndex, step] of bassSteps.entries()) {
    const scaleIndex = motif[(noteIndex + barIndex) % motif.length] % scale.length;
    events.push({
      instrument: "bass",
      step,
      durationSteps: profile.sectionIndex === 2 ? 3.5 : 1.75,
      velocity: profile.sectionIndex === 3 ? 0.8 : 0.68,
      note: root + scale[scaleIndex],
    });
  }

  const motifSteps = getMotifSteps(
    profile.sectionIndex,
    profile.intensity,
    barIndex,
  );
  for (const [noteIndex, step] of motifSteps.entries()) {
    const phraseOffset = (barIndex * 2 + noteIndex) % motif.length;
    const scaleIndex = motif[phraseOffset] % scale.length;
    const octave = profile.sectionIndex === 3 && noteIndex % 4 === 3 ? 24 : 12;
    events.push({
      instrument: "motif",
      step,
      durationSteps: profile.sectionIndex === 2 ? 2.5 : 1.4,
      velocity: profile.sectionIndex === 3 ? 0.48 : 0.36,
      note: root + octave + scale[scaleIndex],
    });
  }

  return events.sort(
    (left, right) =>
      left.step - right.step || left.instrument.localeCompare(right.instrument),
  );
}

export function scheduleBarPlan(
  profile: MusicProfile,
  barIndex: number,
  absoluteStartTime: number,
): readonly ScheduledMusicEvent[] {
  const normalized = normalizeMusicProfile(profile);
  const stepSeconds = getStepDurationSeconds(normalized.bpm);
  const startTime = Number.isFinite(absoluteStartTime) ? absoluteStartTime : 0;
  return createBarPlan(normalized, barIndex).map((event) => ({
    ...event,
    at: startTime + event.step * stepSeconds,
    durationSeconds: event.durationSteps * stepSeconds,
  }));
}

export function getCountdownBeatTimes(
  bpm: number,
  absoluteStartTime: number,
  beats = 3,
) {
  const safeBeats = clamp(integer(beats, 3), 1, 8);
  const beatSeconds = getStepDurationSeconds(bpm) * STEPS_PER_BEAT;
  const startTime = Number.isFinite(absoluteStartTime) ? absoluteStartTime : 0;
  return Array.from(
    { length: safeBeats },
    (_, index) => startTime + index * beatSeconds,
  );
}

function midiToFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

type BrowserAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function createBrowserAudioContext() {
  if (typeof window === "undefined") return null;
  const audioWindow = window as BrowserAudioWindow;
  const AudioContextConstructor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

/**
 * A small look-ahead Web Audio transport. All source start times are absolute
 * AudioContext times, so scheduler wake-up jitter does not become musical drift.
 */
export class AudioDirector {
  private readonly contextFactory: () => AudioContext | null;
  private readonly lookAheadMs: number;
  private readonly scheduleAheadSeconds: number;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activeSources = new Set<AudioScheduledSourceNode>();
  private profile: MusicProfile | null = null;
  private stepIndex = 0;
  private barIndex = 0;
  private nextStepAt = 0;
  private countdownRunStartAt: number | null = null;
  private pausedContextTime: number | null = null;
  private contextReconciliation: Promise<void> | null = null;
  private operationGeneration = 0;
  private desiredState: "stopped" | "countdown" | "running" | "paused" =
    "stopped";
  private running = false;
  private paused = false;
  private muted = false;
  private disposed = false;

  constructor(options: AudioDirectorOptions = {}) {
    this.contextFactory = options.contextFactory ?? createBrowserAudioContext;
    this.lookAheadMs = clamp(options.lookAheadMs ?? 25, 10, 100);
    this.scheduleAheadSeconds = clamp(
      options.scheduleAheadSeconds ?? 0.12,
      0.05,
      0.4,
    );
  }

  get isAvailable() {
    return this.context !== null;
  }

  get isRunning() {
    return this.running && !this.paused;
  }

  get isMuted() {
    return this.muted;
  }

  /** Call from a user gesture when possible. Never throws if audio is blocked. */
  async arm() {
    if (this.disposed) return false;
    let context = this.context;
    if (!context) {
      context = this.contextFactory();
      if (!context) return false;
      this.context = context;
      this.connectOutput(context);
    }
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }
    return (
      !this.disposed &&
      this.context === context &&
      context.state === "running"
    );
  }

  /**
   * Schedules a three-beat musical count-in. The returned times are descriptive;
   * the game must continue to own the countdown and PLAYING transition.
   */
  async startCountdown(
    rawProfile: MusicProfile,
    beats = 3,
    performanceStartAtMs?: number,
  ): Promise<CountdownSchedule> {
    const operation = ++this.operationGeneration;
    this.desiredState = "countdown";
    this.clearTransport();
    this.stopSources();
    this.profile = null;
    this.countdownRunStartAt = null;
    const ready = await this.arm();
    if (
      !ready ||
      !this.context ||
      this.disposed ||
      operation !== this.operationGeneration ||
      this.desiredState !== "countdown"
    ) {
      if (
        operation !== this.operationGeneration ||
        this.desiredState !== "countdown"
      ) {
        await this.reconcileContextState();
      }
      return { started: false, beatTimes: [] };
    }

    const profile = normalizeMusicProfile(rawProfile);
    this.restoreMasterLevel();
    const requestedLeadSeconds =
      Number.isFinite(performanceStartAtMs) && typeof performance !== "undefined"
        ? (performanceStartAtMs! - performance.now()) / 1_000
        : START_LATENCY_SECONDS;
    const firstBeatAt =
      this.context.currentTime +
      Math.max(RESUME_LATENCY_SECONDS, requestedLeadSeconds);
    const beatTimes = getCountdownBeatTimes(profile.bpm, firstBeatAt, beats);
    const beatSeconds = getStepDurationSeconds(profile.bpm) * STEPS_PER_BEAT;
    this.countdownRunStartAt = firstBeatAt + beatTimes.length * beatSeconds;
    const root = STAGE_ROOTS[profile.stageId] + 24;

    beatTimes.forEach((at, index) => {
      const scale = STAGE_SCALES[profile.stageId];
      const note = root + scale[Math.min(index, scale.length - 1)];
      this.scheduleCountdownTone(at, note, index === beatTimes.length - 1);
    });

    return { started: true, beatTimes };
  }

  async startRun(rawProfile: MusicProfile) {
    const operation = ++this.operationGeneration;
    this.desiredState = "running";
    const profile = normalizeMusicProfile(rawProfile);
    this.clearTransport();
    this.stopSources();
    this.profile = profile;
    this.running = true;
    this.paused = false;
    this.pausedContextTime = null;
    const ready = await this.arm();
    if (
      !ready ||
      !this.context ||
      this.disposed ||
      operation !== this.operationGeneration ||
      this.desiredState !== "running"
    ) {
      if (
        operation === this.operationGeneration &&
        this.desiredState === "running"
      ) {
        this.running = true;
        this.paused = true;
        this.silenceMaster();
      } else {
        await this.reconcileContextState();
      }
      return false;
    }

    this.stepIndex = 0;
    this.barIndex = 0;
    const earliestStartAt = this.context.currentTime + 0.006;
    this.nextStepAt =
      this.countdownRunStartAt !== null &&
      this.countdownRunStartAt >= this.context.currentTime - 0.08
        ? Math.max(earliestStartAt, this.countdownRunStartAt)
        : this.context.currentTime + START_LATENCY_SECONDS;
    this.countdownRunStartAt = null;
    this.running = true;
    this.paused = false;
    this.pausedContextTime = null;
    this.restoreMasterLevel();
    this.schedulerTick();
    this.intervalId = setInterval(() => this.schedulerTick(), this.lookAheadMs);
    return true;
  }

  /** Updates the score followed by the transport; it never mutates game state. */
  sync(rawProfile: MusicProfile) {
    this.profile = normalizeMusicProfile(rawProfile);
  }

  /** Re-anchors the score at a game-authored transition without owning it. */
  rephase(rawProfile: MusicProfile) {
    if (
      !this.context ||
      this.context.state !== "running" ||
      !this.running ||
      this.paused ||
      this.disposed
    ) {
      return false;
    }
    this.operationGeneration += 1;
    this.desiredState = "running";
    this.clearInterval();
    this.stopSources();
    this.profile = normalizeMusicProfile(rawProfile);
    this.stepIndex = 0;
    this.barIndex = 0;
    this.nextStepAt = this.context.currentTime + RESUME_LATENCY_SECONDS;
    this.schedulerTick();
    this.intervalId = setInterval(() => this.schedulerTick(), this.lookAheadMs);
    return true;
  }

  async pause() {
    const operation = ++this.operationGeneration;
    this.desiredState = "paused";
    if (!this.running || this.paused) {
      await this.reconcileContextState();
      return;
    }
    this.paused = true;
    this.clearInterval();
    const context = this.context;
    this.pausedContextTime = context?.currentTime ?? null;
    this.silenceMaster();
    if (context?.state === "running") {
      try {
        await context.suspend();
      } catch {
        // If suspend is unsupported, cancel queued notes and rephase on resume.
        this.stopSources();
      }
    }
    if (
      operation === this.operationGeneration &&
      this.desiredState === "paused" &&
      context?.state === "suspended"
    ) {
      this.pausedContextTime = context.currentTime;
    } else {
      await this.reconcileContextState();
    }
  }

  async resume(rawProfile?: MusicProfile) {
    if (!this.running || !this.paused) return false;
    const operation = ++this.operationGeneration;
    this.desiredState = "running";
    if (rawProfile) this.profile = normalizeMusicProfile(rawProfile);
    const ready = await this.arm();
    if (
      !ready ||
      !this.context ||
      !this.profile ||
      this.disposed ||
      operation !== this.operationGeneration ||
      this.desiredState !== "running"
    ) {
      if (
        operation !== this.operationGeneration ||
        this.desiredState !== "running"
      ) {
        await this.reconcileContextState();
      }
      return false;
    }
    const pausedAt = this.pausedContextTime;
    const contextAdvancedWhilePaused =
      pausedAt === null || this.context.currentTime - pausedAt > 0.012;
    this.paused = false;
    this.pausedContextTime = null;
    if (
      contextAdvancedWhilePaused ||
      this.nextStepAt < this.context.currentTime - 0.002
    ) {
      this.stopSources();
      this.stepIndex = 0;
      this.barIndex = 0;
      this.nextStepAt = this.context.currentTime + RESUME_LATENCY_SECONDS;
    }
    this.restoreMasterLevel();
    this.schedulerTick();
    this.intervalId = setInterval(() => this.schedulerTick(), this.lookAheadMs);
    return true;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.restoreMasterLevel();
  }

  /** Stops countdown or run audio without closing the reusable AudioContext. */
  stop() {
    this.operationGeneration += 1;
    this.desiredState = "stopped";
    this.clearTransport();
    this.stopSources();
    this.profile = null;
    this.stepIndex = 0;
    this.barIndex = 0;
    this.countdownRunStartAt = null;
    this.pausedContextTime = null;
    this.silenceMaster();
    void this.reconcileContextState();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    if (this.context && this.context.state !== "closed") {
      try {
        await this.context.close();
      } catch {
        // Context teardown must not disrupt React unmounting.
      }
    }
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  private connectOutput(context: AudioContext) {
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = this.muted ? 0 : 0.58;
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.connect(compressor);
    compressor.connect(context.destination);
    this.master = master;
    this.noiseBuffer = this.createNoiseBuffer(context);
  }

  private createNoiseBuffer(context: AudioContext) {
    const length = Math.max(1, Math.floor(context.sampleRate * 0.2));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let seed = 0x4b4559;
    for (let index = 0; index < channel.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      channel[index] = (seed / 0x80000000 - 1) * 0.82;
    }
    return buffer;
  }

  private schedulerTick() {
    const context = this.context;
    const profile = this.profile;
    if (!context || !profile || !this.running || this.paused) return;

    const horizon = context.currentTime + this.scheduleAheadSeconds;
    while (this.nextStepAt < horizon) {
      const plan = createBarPlan(profile, this.barIndex);
      for (const event of plan) {
        if (event.step === this.stepIndex) {
          this.scheduleEvent(event, this.nextStepAt, profile.bpm);
        }
      }

      this.nextStepAt += getStepDurationSeconds(profile.bpm);
      this.stepIndex += 1;
      if (this.stepIndex >= STEPS_PER_BAR) {
        this.stepIndex = 0;
        this.barIndex += 1;
      }
    }
  }

  private scheduleEvent(event: MusicEvent, at: number, bpm: number) {
    const durationSeconds = event.durationSteps * getStepDurationSeconds(bpm);
    if (event.instrument === "kick") this.scheduleKick(at, event.velocity);
    if (event.instrument === "pulse") this.scheduleNoise(at, event.velocity, "pulse");
    if (event.instrument === "hat") this.scheduleNoise(at, event.velocity, "hat");
    if (event.instrument === "bass" && event.note !== undefined) {
      this.scheduleBass(at, durationSeconds, event.note, event.velocity);
    }
    if (event.instrument === "motif" && event.note !== undefined) {
      this.scheduleMotif(at, durationSeconds, event.note, event.velocity);
    }
  }

  private scheduleKick(at: number, velocity: number) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(148, at);
    oscillator.frequency.exponentialRampToValueAtTime(48, at + 0.09);
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.exponentialRampToValueAtTime(0.72 * velocity, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + 0.27);
    oscillator.connect(gain);
    gain.connect(master);
    this.track(oscillator);
    oscillator.start(at);
    oscillator.stop(at + 0.29);
  }

  private scheduleNoise(
    at: number,
    velocity: number,
    kind: "pulse" | "hat",
  ) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = kind === "hat" ? "highpass" : "bandpass";
    filter.frequency.value = kind === "hat" ? 6200 : 1450;
    filter.Q.value = kind === "hat" ? 0.8 : 1.7;
    const duration = kind === "hat" ? 0.045 : 0.115;
    const level = (kind === "hat" ? 0.16 : 0.24) * velocity;
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    this.track(source);
    source.start(at);
    source.stop(at + duration + 0.01);
  }

  private scheduleBass(
    at: number,
    duration: number,
    note: number,
    velocity: number,
  ) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = midiToFrequency(note);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, at);
    filter.frequency.exponentialRampToValueAtTime(170, at + duration * 0.7);
    filter.Q.value = 3.2;
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.exponentialRampToValueAtTime(0.17 * velocity, at + 0.012);
    gain.gain.setValueAtTime(0.13 * velocity, at + Math.max(0.02, duration * 0.65));
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    this.track(oscillator);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private scheduleMotif(
    at: number,
    duration: number,
    note: number,
    velocity: number,
  ) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = midiToFrequency(note);
    filter.type = "lowpass";
    filter.frequency.value = 2200;
    filter.Q.value = 1.1;
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.exponentialRampToValueAtTime(0.11 * velocity, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    this.track(oscillator);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private scheduleCountdownTone(at: number, note: number, finalBeat: boolean) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = finalBeat ? "triangle" : "sine";
    oscillator.frequency.value = midiToFrequency(note);
    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.exponentialRampToValueAtTime(finalBeat ? 0.16 : 0.1, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(SILENCE, at + (finalBeat ? 0.32 : 0.18));
    oscillator.connect(gain);
    gain.connect(master);
    this.track(oscillator);
    oscillator.start(at);
    oscillator.stop(at + (finalBeat ? 0.34 : 0.2));
  }

  private track(source: AudioScheduledSourceNode) {
    this.activeSources.add(source);
    source.addEventListener(
      "ended",
      () => {
        this.activeSources.delete(source);
      },
      { once: true },
    );
  }

  private stopSources() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // The source may already have naturally ended.
      }
    }
    this.activeSources.clear();
  }

  private restoreMasterLevel() {
    if (!this.context || !this.master) return;
    const at = this.context.currentTime;
    this.master.gain.cancelScheduledValues(at);
    const shouldStaySilent =
      this.muted ||
      this.paused ||
      this.desiredState === "paused" ||
      this.desiredState === "stopped";
    this.master.gain.setTargetAtTime(shouldStaySilent ? 0 : 0.58, at, 0.012);
  }

  private silenceMaster() {
    if (!this.context || !this.master) return;
    const at = this.context.currentTime;
    this.master.gain.cancelScheduledValues(at);
    this.master.gain.setTargetAtTime(0, at, 0.005);
  }

  private async reconcileContextState() {
    const existingReconciliation = this.contextReconciliation;
    if (existingReconciliation) {
      await existingReconciliation;
      return;
    }

    const reconciliation = this.reconcileContextStateOnce();
    this.contextReconciliation = reconciliation;
    try {
      await reconciliation;
    } finally {
      if (this.contextReconciliation === reconciliation) {
        this.contextReconciliation = null;
      }
    }
  }

  private async reconcileContextStateOnce() {
    const context = this.context;
    if (!context || this.disposed || context.state === "closed") return;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (this.disposed || this.context !== context) return;

      const shouldSuspend =
        this.desiredState === "paused" || this.desiredState === "stopped";
      if (shouldSuspend) {
        this.silenceMaster();
        if (context.state !== "running") return;
        try {
          await context.suspend();
        } catch {
          this.stopSources();
          return;
        }
        continue;
      }

      const shouldRun =
        this.desiredState === "running" ||
        this.desiredState === "countdown";
      if (!shouldRun || context.state !== "suspended") return;
      try {
        await context.resume();
      } catch {
        return;
      }
    }
  }

  private clearInterval() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private clearTransport() {
    this.clearInterval();
    this.running = false;
    this.paused = false;
  }
}
