"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_KEYS,
  BEAT_MS,
  getIntensity,
  getPattern,
  INVULNERABILITY_MS,
  KEY_ROWS,
  MAX_HP,
  resolveCollision,
  ROUND_SECONDS,
} from "./gameLogic";

type Phase = "ready" | "running" | "paused" | "won" | "lost";
type AttackState = "idle" | "warning" | "impact";

function formatTime(milliseconds: number) {
  return Math.max(0, Math.ceil(milliseconds / 1000))
    .toString()
    .padStart(2, "0");
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

export function KeyboardDodge() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [playerKey, setPlayerKey] = useState("F");
  const [hp, setHp] = useState(MAX_HP);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [remainingMs, setRemainingMs] = useState(ROUND_SECONDS * 1000);
  const [targets, setTargets] = useState<string[]>([]);
  const [attackState, setAttackState] = useState<AttackState>("idle");
  const [hurt, setHurt] = useState(false);
  const [muted, setMuted] = useState(false);

  const playerKeyRef = useRef(playerKey);
  const phaseRef = useRef(phase);
  const hpRef = useRef(hp);
  const remainingMsRef = useRef(remainingMs);
  const invulnerableUntilRef = useRef(0);
  const attackIndexRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    playerKeyRef.current = playerKey;
  }, [playerKey]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    hpRef.current = hp;
  }, [hp]);

  const playTone = useCallback(
    (frequency: number, duration = 0.06, volume = 0.04) => {
      if (muted || typeof window === "undefined") return;
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
    [muted],
  );

  const startGame = useCallback(() => {
    setPlayerKey("F");
    playerKeyRef.current = "F";
    setHp(MAX_HP);
    hpRef.current = MAX_HP;
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setRemainingMs(ROUND_SECONDS * 1000);
    remainingMsRef.current = ROUND_SECONDS * 1000;
    setTargets([]);
    setAttackState("idle");
    setHurt(false);
    attackIndexRef.current = 0;
    invulnerableUntilRef.current = 0;
    phaseRef.current = "running";
    setPhase("running");
    playTone(440, 0.08, 0.035);
  }, [playTone]);

  const moveTo = useCallback(
    (key: string) => {
      if (phaseRef.current !== "running" || playerKeyRef.current === key) return;
      playerKeyRef.current = key;
      setPlayerKey(key);
      playTone(
        280 + ALL_KEYS.indexOf(key) * 9,
        0.035,
        0.018,
      );
    },
    [playTone],
  );

  const resumeGame = useCallback(() => {
    phaseRef.current = "running";
    setPhase("running");
  }, []);

  const pauseGame = useCallback(() => {
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

      if (event.code === "Escape") {
        if (phaseRef.current === "running") pauseGame();
        else if (phaseRef.current === "paused") resumeGame();
        return;
      }
      if (event.code === "Digit0") {
        setMuted((value) => !value);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (["ready", "won", "lost"].includes(phaseRef.current)) startGame();
        return;
      }
      if (event.code === "KeyR" && phaseRef.current !== "running") {
        startGame();
        return;
      }

      const key = event.code.startsWith("Key") ? event.code.slice(3) : "";
      if (ALL_KEYS.includes(key)) moveTo(key);
    };

    const pauseIfPlaying = () => {
      if (phaseRef.current === "running") pauseGame();
    };

    const pauseWhenHidden = () => {
      if (document.hidden && phaseRef.current === "running") pauseGame();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", pauseIfPlaying);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", pauseIfPlaying);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [moveTo, pauseGame, resumeGame, startGame]);

  useEffect(() => {
    if (phase !== "running") return;
    const endAt = performance.now() + remainingMsRef.current;
    let frame = 0;

    const updateClock = (now: number) => {
      const next = Math.max(0, endAt - now);
      remainingMsRef.current = next;
      setRemainingMs(next);
      if (next === 0) {
        phaseRef.current = "won";
        setScore((value) => value + hpRef.current * 500);
        setPhase("won");
        playTone(880, 0.22, 0.05);
        return;
      }
      frame = window.requestAnimationFrame(updateClock);
    };

    frame = window.requestAnimationFrame(updateClock);
    return () => window.cancelAnimationFrame(frame);
  }, [phase, playTone]);

  useEffect(() => {
    if (phase !== "running") return;
    let resolveTimer = 0;
    let clearTimer = 0;
    let nextTimer = 0;
    let hurtTimer = 0;
    let cancelled = false;
    let nextImpactAt = performance.now() + BEAT_MS;

    const runAttack = () => {
      if (cancelled || phaseRef.current !== "running") return;
      const intensity = getIntensity(remainingMsRef.current);
      const attackNumber = attackIndexRef.current++;
      const nextTargets = getPattern(
        attackNumber,
        playerKeyRef.current,
        intensity,
      );

      setTargets(nextTargets);
      setAttackState("warning");
      playTone(180 + intensity * 25, 0.05, 0.025);

      resolveTimer = window.setTimeout(() => {
        setAttackState("impact");
        playTone(90, 0.12, 0.045);

        const collision = resolveCollision(
          nextTargets,
          playerKeyRef.current,
          performance.now(),
          invulnerableUntilRef.current,
        );
        if (collision.inDanger) {
          if (collision.damaged) {
            invulnerableUntilRef.current = collision.invulnerableUntil;
            setHurt(true);
            setStreak(0);
            setHp((current) => {
              const next = Math.max(0, current - 1);
              hpRef.current = next;
              if (next === 0) {
                phaseRef.current = "lost";
                setPhase("lost");
                playTone(55, 0.35, 0.06);
              }
              return next;
            });
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
            setScore((value) => value + 100 + Math.min(next, 20) * 10);
            return next;
          });
        }

        clearTimer = window.setTimeout(() => {
          setTargets([]);
          setAttackState("idle");
        }, 180);
        nextImpactAt += intensity === 3 ? BEAT_MS * 1.5 : BEAT_MS * 2;
        const nextWarningAt = nextImpactAt - BEAT_MS;
        nextTimer = window.setTimeout(
          runAttack,
          Math.max(0, nextWarningAt - performance.now()),
        );
      }, Math.max(0, nextImpactAt - performance.now()));
    };

    runAttack();
    return () => {
      cancelled = true;
      window.clearTimeout(resolveTimer);
      window.clearTimeout(clearTimer);
      window.clearTimeout(nextTimer);
      window.clearTimeout(hurtTimer);
      setTargets([]);
      setAttackState("idle");
    };
  }, [phase, playTone]);

  const progress = useMemo(
    () =>
      ((ROUND_SECONDS * 1000 - remainingMs) / (ROUND_SECONDS * 1000)) * 100,
    [remainingMs],
  );
  const dangerLabel =
    attackState === "warning"
      ? "위험 키 예고 중"
      : attackState === "impact"
        ? "공격!"
        : "다음 박자 대기";

  return (
    <main className={`game-shell ${hurt ? "is-hurt" : ""}`}>
      <div className="ambient-grid" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">K</span>
          <div>
            <p className="eyebrow">QWERTY RHYTHM SURVIVAL</p>
            <h1>KEY<span>{"//"}</span>DODGE</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`status-light ${phase === "running" ? "active" : ""}`}>
            <i aria-hidden="true" /> {phase === "running" ? "LIVE" : "STANDBY"}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setMuted((value) => !value)}
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
          <div className="timeline" aria-label={`남은 시간 ${formatTime(remainingMs)}초`}>
            <div className="timeline-copy">
              <span>SURVIVE THE SEQUENCE</span>
              <strong>00:{formatTime(remainingMs)}</strong>
            </div>
            <div className="timeline-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="arena">
            <div className="beat-readout" aria-live="polite">
              <span className={`beat-dot ${attackState}`} aria-hidden="true" />
              {dangerLabel}
            </div>

            <div className="keyboard-frame">
              <div className="keyboard-labels" aria-hidden="true">
                <span>PHYSICAL INPUT MAP</span>
                <span>UNIT 01 / QWERTY</span>
              </div>
              <div className="keyboard" role="group" aria-label="QWERTY 게임 보드">
                {KEY_ROWS.map((row, rowIndex) => (
                  <div className={`key-row row-${rowIndex}`} key={row.join("")}>
                    {row.map((key) => {
                      const targeted = targets.includes(key);
                      const isPlayer = playerKey === key;
                      const classes = [
                        "key-cap",
                        targeted && attackState === "warning" ? "warning" : "",
                        targeted && attackState === "impact" ? "impact" : "",
                        isPlayer ? "player" : "",
                        isPlayer && hurt ? "damaged" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <button
                          type="button"
                          tabIndex={-1}
                          className={classes}
                          key={key}
                          onClick={() => moveTo(key)}
                          aria-label={`${key} 키${isPlayer ? ", 현재 위치" : ""}${targeted ? ", 위험" : ""}`}
                        >
                          <span className="key-letter">{key}</span>
                          <span className="key-code">{key.charCodeAt(0)}</span>
                          {isPlayer && <i className="player-core" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="keyboard-footer" aria-hidden="true">
                <span>INPUT: <b>KEY_{playerKey}</b></span>
                <span>LATENCY: LOCAL</span>
              </div>
            </div>

            {phase !== "running" && (
              <div className="game-overlay">
                <div className="overlay-card">
                  <p className="overlay-code">
                    {phase === "ready" ? "BOOT_SEQUENCE" : phase.toUpperCase()}
                  </p>
                  <h2>
                    {phase === "ready" && <>키보드가<br />전장이 된다</>}
                    {phase === "paused" && <>일시정지</>}
                    {phase === "won" && <>SEQUENCE<br />CLEARED</>}
                    {phase === "lost" && <>SIGNAL<br />LOST</>}
                  </h2>
                  <p className="overlay-description">
                    {phase === "ready" && "위험 표시가 터지기 전에 다른 알파벳 키로 이동하세요. 45초를 버티면 승리합니다."}
                    {phase === "paused" && "준비되면 ESC를 눌러 계속하세요."}
                    {phase === "won" && `최종 점수 ${score.toLocaleString()} · 최고 연속 회피 ${bestStreak}`}
                    {phase === "lost" && `점수 ${score.toLocaleString()} · ${formatTime(remainingMs)}초 남음`}
                  </p>
                  <button
                    type="button"
                    className="start-button"
                    onClick={phase === "paused" ? resumeGame : startGame}
                  >
                    <span>{phase === "paused" ? "계속하기" : phase === "ready" ? "게임 시작" : "다시 시도"}</span>
                    <kbd>{phase === "paused" ? "ESC" : "SPACE"}</kbd>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="guide-panel">
          <p className="panel-title">HOW TO SURVIVE</p>
          <ol>
            <li><b>01</b><span><strong>위험 감지</strong>붉게 예고되는 키를 확인</span></li>
            <li><b>02</b><span><strong>즉시 이동</strong>안전한 알파벳 키를 누르기</span></li>
            <li><b>03</b><span><strong>박자 유지</strong>연속 회피로 점수 증폭</span></li>
          </ol>
          <div className="control-legend">
            <span><kbd>A–Z</kbd> MOVE</span>
            <span><kbd>ESC</kbd> PAUSE</span>
            <span><kbd>0</kbd> SOUND</span>
          </div>
        </aside>
      </section>

      <footer className="game-footer">
        <span>PROTOTYPE BUILD 0.1</span>
        <span className="footer-message">마지막으로 누른 키가 곧 당신의 위치입니다.</span>
        <span>KEYBOARD EVENT: CODE</span>
      </footer>
    </main>
  );
}
