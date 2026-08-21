import assert from "node:assert/strict";
import test from "node:test";
import {
  AudioDirector,
  createBarPlan,
  getCountdownBeatTimes,
  getStepDurationSeconds,
  musicProfileFromWave,
  normalizeMusicProfile,
  PROCEDURAL_AUDIO_NOTICE,
  scheduleBarPlan,
  SCORE_START_LEAD_MS,
  type MusicProfile,
} from "../app/audioDirector.ts";

const BASE_PROFILE: MusicProfile = {
  stageId: 1,
  bpm: 120,
  sectionIndex: 0,
  intensity: 1,
  waveIndex: 0,
};

function createDeferredAudioContext() {
  let state: AudioContextState = "suspended";
  let releaseResume: (() => void) | null = null;
  const audioParam = () => ({
    value: 0,
    cancelScheduledValues() {},
    setTargetAtTime() {},
  });
  const connectable = () => ({ connect() {} });
  const context = {
    get state() {
      return state;
    },
    currentTime: 0,
    sampleRate: 48_000,
    destination: {},
    createGain() {
      return { ...connectable(), gain: audioParam() };
    },
    createDynamicsCompressor() {
      return {
        ...connectable(),
        threshold: audioParam(),
        knee: audioParam(),
        ratio: audioParam(),
        attack: audioParam(),
        release: audioParam(),
      };
    },
    createBuffer() {
      return { getChannelData: () => new Float32Array(1) };
    },
    resume() {
      return new Promise<void>((resolve) => {
        releaseResume = () => {
          state = "running";
          resolve();
        };
      });
    },
    async close() {
      state = "closed";
    },
  } as unknown as AudioContext;

  return {
    context,
    releaseResume: () => releaseResume?.(),
  };
}

function createLifecycleAudioContext(
  options: {
    failFirstResume?: boolean;
    deferResume?: boolean;
    deferSuspend?: boolean;
  } = {},
) {
  let state: AudioContextState = options.failFirstResume ? "suspended" : "running";
  let resumeCalls = 0;
  let suspendCalls = 0;
  let sourceStarts = 0;
  const pendingResumes: (() => void)[] = [];
  const pendingSuspends: (() => void)[] = [];

  const audioParam = (initialValue = 0) => {
    const parameter = {
      value: initialValue,
      cancelScheduledValues() {
        return parameter;
      },
      setTargetAtTime() {
        return parameter;
      },
      setValueAtTime() {
        return parameter;
      },
      exponentialRampToValueAtTime() {
        return parameter;
      },
    };
    return parameter;
  };
  const connectable = () => ({
    connect() {},
  });
  const scheduledSource = () => ({
    ...connectable(),
    addEventListener() {},
    start() {
      sourceStarts += 1;
    },
    stop() {},
  });
  const context = {
    get state() {
      return state;
    },
    currentTime: 0,
    sampleRate: 48_000,
    destination: {},
    createGain() {
      return { ...connectable(), gain: audioParam() };
    },
    createDynamicsCompressor() {
      return {
        ...connectable(),
        threshold: audioParam(),
        knee: audioParam(),
        ratio: audioParam(),
        attack: audioParam(),
        release: audioParam(),
      };
    },
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    },
    createOscillator() {
      return {
        ...scheduledSource(),
        type: "sine",
        frequency: audioParam(),
      };
    },
    createBufferSource() {
      return {
        ...scheduledSource(),
        buffer: null,
      };
    },
    createBiquadFilter() {
      return {
        ...connectable(),
        type: "lowpass",
        frequency: audioParam(),
        Q: audioParam(),
      };
    },
    async resume() {
      resumeCalls += 1;
      if (options.failFirstResume && resumeCalls === 1) {
        throw new Error("gesture rejected");
      }
      if (options.deferResume) {
        await new Promise<void>((resolve) => {
          pendingResumes.push(() => {
            state = "running";
            resolve();
          });
        });
        return;
      }
      state = "running";
    },
    async suspend() {
      suspendCalls += 1;
      if (options.deferSuspend) {
        state = "suspended";
        await new Promise<void>((resolve) => {
          pendingSuspends.push(() => {
            resolve();
          });
        });
        return;
      }
      state = "suspended";
    },
    async close() {
      state = "closed";
    },
  } as unknown as AudioContext;

  return {
    context,
    get resumeCalls() {
      return resumeCalls;
    },
    get suspendCalls() {
      return suspendCalls;
    },
    get sourceStarts() {
      return sourceStarts;
    },
    get pendingResumeCount() {
      return pendingResumes.length;
    },
    get pendingSuspendCount() {
      return pendingSuspends.length;
    },
    releaseNextResume() {
      pendingResumes.shift()?.();
    },
    releaseNextSuspend() {
      pendingSuspends.shift()?.();
    },
  };
}

async function waitForMicrotaskCondition(condition: () => boolean) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  assert.fail("condition did not become true within the microtask budget");
}

function readTransportCursor(director: AudioDirector) {
  const transport = director as unknown as {
    stepIndex: number;
    barIndex: number;
    nextStepAt: number;
  };
  return {
    stepIndex: transport.stepIndex,
    barIndex: transport.barIndex,
    nextStepAt: transport.nextStepAt,
  };
}

test("documents an asset-free original procedural soundtrack", () => {
  assert.match(PROCEDURAL_AUDIO_NOTICE, /Original procedural soundtrack/);
  assert.match(PROCEDURAL_AUDIO_NOTICE, /no third-party audio assets/);
});

test("normalizes unsafe score inputs into supported musical bounds", () => {
  assert.deepEqual(
    normalizeMusicProfile({
      stageId: 99 as 1,
      bpm: Number.POSITIVE_INFINITY,
      sectionIndex: 12,
      intensity: -8,
      waveIndex: -4,
    }),
    {
      stageId: 6,
      bpm: 120,
      sectionIndex: 3,
      intensity: 1,
      waveIndex: 0,
    },
  );
  assert.equal(normalizeMusicProfile({ ...BASE_PROFILE, bpm: 12 }).bpm, 40);
  assert.equal(normalizeMusicProfile({ ...BASE_PROFILE, bpm: 900 }).bpm, 240);
});

test("converts the authored wave profile without becoming its clock", () => {
  const music = musicProfileFromWave(
    4,
    { bpm: 142, sectionIndex: 3, waveIndex: 61 },
    3,
  );
  assert.deepEqual(music, {
    stageId: 4,
    bpm: 142,
    sectionIndex: 3,
    intensity: 3,
    waveIndex: 61,
  });
  assert.equal("impactAt" in music, false);
  assert.equal("warningAt" in music, false);
});

test("builds deterministic cohesive bars with kick, pulse, bass, motif and hats", () => {
  const first = createBarPlan(BASE_PROFILE, 0);
  const again = createBarPlan(BASE_PROFILE, 0);
  assert.deepEqual(first, again);
  assert.deepEqual(
    new Set(first.map((event) => event.instrument)),
    new Set(["kick", "pulse", "hat", "bass", "motif"]),
  );
  assert.ok(
    first.every(
      (event) =>
        event.step >= 0 &&
        event.step < 16 &&
        event.durationSteps > 0 &&
        event.velocity > 0 &&
        event.velocity <= 1,
    ),
  );
});

test("gives every stage its own tonal phrase", () => {
  const signatures = Array.from({ length: 6 }, (_, stageIndex) => {
    const plan = createBarPlan(
      { ...BASE_PROFILE, stageId: (stageIndex + 1) as MusicProfile["stageId"] },
      0,
    );
    return plan
      .filter((event) => event.instrument === "motif")
      .map((event) => event.note)
      .join(",");
  });
  assert.equal(new Set(signatures).size, 6);
});

test("ACT and intensity changes materially reshape the arrangement", () => {
  const opening = createBarPlan(BASE_PROFILE, 0);
  const breath = createBarPlan(
    { ...BASE_PROFILE, sectionIndex: 2, intensity: 1 },
    0,
  );
  const finale = createBarPlan(
    { ...BASE_PROFILE, sectionIndex: 3, intensity: 3 },
    0,
  );
  const count = (plan: readonly { instrument: string }[], instrument: string) =>
    plan.filter((event) => event.instrument === instrument).length;

  assert.ok(count(breath, "hat") < count(finale, "hat"));
  assert.ok(count(opening, "kick") < count(finale, "kick"));
  assert.ok(count(opening, "motif") < count(finale, "motif"));
});

test("maps all score events onto absolute AudioContext time", () => {
  const startAt = 42.25;
  const scheduled = scheduleBarPlan(BASE_PROFILE, 0, startAt);
  const stepSeconds = getStepDurationSeconds(120);
  assert.equal(stepSeconds, 0.125);
  assert.ok(scheduled.length > 0);
  for (const event of scheduled) {
    assert.equal(event.at, startAt + event.step * stepSeconds);
    assert.equal(event.durationSeconds, event.durationSteps * stepSeconds);
    assert.ok(event.at >= startAt);
    assert.ok(event.at < startAt + 2);
  }
});

test("count-in follows the selected opening BPM on an absolute timeline", () => {
  assert.deepEqual(getCountdownBeatTimes(120, 7, 3), [7, 7.5, 8]);
  assert.deepEqual(getCountdownBeatTimes(60, 2, 4), [2, 3, 4, 5]);
  assert.equal(SCORE_START_LEAD_MS, 24);
});

test("a stopped pending count-in cannot revive after audio unlock", async () => {
  const deferred = createDeferredAudioContext();
  const director = new AudioDirector({
    contextFactory: () => deferred.context,
  });
  const pendingCountdown = director.startCountdown(BASE_PROFILE);

  director.stop();
  deferred.releaseResume();

  assert.deepEqual(await pendingCountdown, { started: false, beatTimes: [] });
  assert.equal(director.isRunning, false);
  await director.dispose();
});

test("suspend and resume preserve the scheduler phase when context time is frozen", async () => {
  const fake = createLifecycleAudioContext();
  const director = new AudioDirector({
    contextFactory: () => fake.context,
    lookAheadMs: 100,
    scheduleAheadSeconds: 0.05,
  });

  assert.equal(await director.startRun(BASE_PROFILE), true);
  const beforePause = readTransportCursor(director);
  assert.ok(beforePause.stepIndex > 0);
  assert.ok(fake.sourceStarts > 0);

  await director.pause();
  assert.equal(director.isRunning, false);
  assert.equal(fake.suspendCalls, 1);
  assert.deepEqual(readTransportCursor(director), beforePause);

  assert.equal(await director.resume(), true);
  assert.equal(director.isRunning, true);
  assert.equal(fake.resumeCalls, 1);
  assert.deepEqual(readTransportCursor(director), beforePause);
  await director.dispose();
});

test("a rejected initial arm can be retried by an explicit pause and resume gesture", async () => {
  const fake = createLifecycleAudioContext({ failFirstResume: true });
  const director = new AudioDirector({
    contextFactory: () => fake.context,
    lookAheadMs: 100,
  });

  assert.equal(await director.startRun(BASE_PROFILE), false);
  assert.equal(director.isRunning, false);
  assert.equal(fake.resumeCalls, 1);

  await director.pause();
  assert.equal(await director.resume(), true);
  assert.equal(fake.resumeCalls, 2);
  assert.equal(director.isRunning, true);
  assert.ok(fake.sourceStarts > 0);
  await director.dispose();
});

test("stop prevents a pending asynchronous run start from reviving", async () => {
  const deferred = createDeferredAudioContext();
  const director = new AudioDirector({
    contextFactory: () => deferred.context,
  });
  const pendingStart = director.startRun(BASE_PROFILE);

  director.stop();
  deferred.releaseResume();

  assert.equal(await pendingStart, false);
  assert.equal(director.isRunning, false);
  await director.dispose();
});

test("pause prevents a pending asynchronous run start from reviving", async () => {
  const deferred = createDeferredAudioContext();
  const director = new AudioDirector({
    contextFactory: () => deferred.context,
  });
  const pendingStart = director.startRun(BASE_PROFILE);

  await director.pause();
  deferred.releaseResume();

  assert.equal(await pendingStart, false);
  assert.equal(director.isRunning, false);
  await director.dispose();
});

test("rapid pause, resume, pause reconciles a stale resume back to suspended", async () => {
  const fake = createLifecycleAudioContext({
    deferResume: true,
    deferSuspend: true,
  });
  const director = new AudioDirector({
    contextFactory: () => fake.context,
    lookAheadMs: 100,
  });

  assert.equal(await director.startRun(BASE_PROFILE), true);

  const firstPause = director.pause();
  assert.equal(fake.pendingSuspendCount, 1);
  fake.releaseNextSuspend();

  const staleResume = director.resume();
  assert.equal(fake.pendingResumeCount, 1);
  const finalPause = director.pause();
  assert.equal(director.isRunning, false);

  fake.releaseNextResume();
  await waitForMicrotaskCondition(() => fake.pendingSuspendCount === 1);
  fake.releaseNextSuspend();

  assert.equal(await staleResume, false);
  await Promise.all([firstPause, finalPause]);
  assert.equal(fake.context.state, "suspended");
  assert.equal(director.isRunning, false);
  assert.equal(fake.resumeCalls, 1);
  assert.equal(fake.suspendCalls, 2);
  await director.dispose();
});

test("fails silently when Web Audio is unavailable", async () => {
  const director = new AudioDirector({ contextFactory: () => null });
  assert.equal(await director.arm(), false);
  assert.equal(await director.startRun(BASE_PROFILE), false);
  assert.deepEqual(await director.startCountdown(BASE_PROFILE), {
    started: false,
    beatTimes: [],
  });
  director.setMuted(true);
  assert.equal(director.isMuted, true);
  director.stop();
  await director.dispose();
});
