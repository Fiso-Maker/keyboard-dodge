import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the separate KEY//DODGE title screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>KEY\/\/DODGE/);
  assert.match(html, /<html[^>]*data-theme="polar-white"/);
  assert.match(html, /QWERTY RHYTHM ACTION/);
  assert.match(html, /KEYBOARD/);
  assert.match(html, /title-logo-accent[^>]*>DODGE/);
  assert.match(html, /QWERTY RHYTHM DODGE/);
  assert.match(html, /THEME/);
  assert.match(html, /게임 시작/);
  assert.match(html, /실제 키보드를 전장으로/);
  assert.doesNotMatch(html, /05—26|82—156|게임 구성/);
  assert.doesNotMatch(html, /BUILD 0\.5|PROTOTYPE/);
  assert.doesNotMatch(html, /STAGE_SELECT|HOME LINE|게임 화면/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("keeps the physical-key input and safety rules in source", async () => {
  const source = await readFile(
    new URL("../app/KeyboardDodge.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /event\.code\.startsWith\("Key"\)/);
  assert.match(source, /event\.repeat/);
  assert.match(source, /event\.isComposing/);
  assert.match(source, /resolveCollision/);
  assert.match(source, /performance\.now\(\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /MAX_HP/);
  assert.match(source, /getBeatMs/);
  assert.match(source, /getWaveProfile/);
  assert.match(source, /getStageTempoRange/);
  assert.match(source, /getStageKeyRange/);
  assert.match(source, /waveProfileRef/);
  assert.match(source, /getNextWaveTiming/);
  assert.match(source, /resolveZoneEntry/);
  assert.match(source, /getZoneTransition/);
  assert.match(source, /getImpactHoldMs/);
  assert.match(source, /zone-pending/);
  assert.match(source, /runtimeActiveKeys/);
  assert.match(source, /COLLAPSE EJECT/);
  assert.match(source, /resolveCollision\(\s*plan\.collapsingKeys/);
  assert.match(source, /FIELD COLLAPSE/);
  assert.match(source, /ZONE RESTORE/);
  assert.match(source, /collapse-warning/);
  assert.match(source, /restore-warning/);
  assert.match(source, /TEMPO DOWN/);
  assert.match(source, /STAGES\.find/);
  assert.match(source, /`Key\$\{stage\.selectKey\}`/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /data-stage-id/);
  assert.match(source, /stageTrackRef/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /stage-carousel/);
  assert.match(source, /countdownStartedAtRef\.current \+ beatMs/);
  assert.match(source, /focusedStageId/);
  assert.match(source, /getStageSelectionAction\(focusedStageId, stageId\)/);
  assert.match(source, /chooseStage/);
  assert.match(source, /PRESS \$\{stage\.selectKey\} AGAIN TO START/);
  assert.match(source, /phase !== "countdown"/);
  assert.match(source, /COUNTDOWN_BEATS/);
  assert.match(source, /countdownValue/);
  assert.match(source, /nextBeatAt/);
  assert.match(source, /countdown-badge/);
  assert.match(source, /PREP MOVE/);
  assert.match(source, /currentPhase !== "countdown"/);
  assert.match(source, /시작 전 준비 이동/);
  assert.match(source, /cancelCountdown/);
  assert.match(source, /showTitle/);
  assert.match(source, /nextStage/);
  assert.match(source, /pausedAttackRef/);
  assert.match(source, /pausedInvulnerabilityRef/);
  assert.match(source, /remainingMs/);
  assert.match(source, /isNativeButtonActivation/);
  assert.match(source, /getCompletedWaveCount/);
  assert.match(source, /getAttackPattern/);
  assert.match(source, /pattern\.surf/);
  assert.match(source, /WAVE SURGE/);
  assert.match(source, /surf-signal/);
  assert.match(source, /`surf-warning surf-\$\{surfPattern\.direction\}`/);
  assert.match(source, /--surf-left/);
  assert.match(source, /surfPattern\.leftPercent/);
  assert.match(source, /resolveHeal/);
  assert.match(source, /lastInputRef/);
  assert.match(source, /playerThreatened/);
  assert.match(source, /현재 위치 KEY_/);
  assert.match(source, /MOVE!/);
  assert.match(source, /ONLY SAFE/);
  assert.match(source, /희귀 회복/);
  assert.match(source, /applyRunResult/);
  assert.match(source, /getBrowserStorage/);
  assert.match(source, /loadProgress\(storage\)/);
  assert.match(source, /saveProgress\(storage/);
  assert.match(source, /completeRun/);
  assert.match(source, /RUN GRADE/);
  assert.match(source, /className={`stage-record/);
  assert.match(source, /act-transition/);
  assert.match(source, /waveProfile\.waveIndex === completedWaves/);
  assert.match(source, /AudioDirector/);
  assert.match(source, /musicProfileFromWave/);
  assert.match(source, /startCountdown/);
  assert.match(source, /startRun/);
  assert.match(source, /\.sync\(/);
  assert.match(source, /\.rephase\(/);
  assert.match(source, /SCORE_START_LEAD_MS/);
  assert.match(source, /\.pause\(\)/);
  assert.match(source, /\.resume\(/);
  assert.match(source, /ORIGINAL PROCEDURAL SCORE/);
});

test("keeps the six-theme settings model and instrument layout in source", async () => {
  const [source, settingsSource, themesSource, themeStyles] = await Promise.all([
    readFile(new URL("../app/KeyboardDodge.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ThemeSettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/themes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/theme-system.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /import \{ ThemeSettings \}/);
  assert.match(source, /useState<ThemeId>\(DEFAULT_THEME_ID\)/);
  assert.match(source, /if \(settingsOpen\) \{[\s\S]*?event\.code === "Escape"[\s\S]*?return;/);
  assert.match(source, /<ThemeSettings/);
  assert.match(source, /className="instrument-hud"/);
  assert.match(source, /aria-label="현재 스테이지 상태"/);
  assert.match(source, /className="stage-carousel"/);
  assert.match(source, /className=\{`stage-track/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /comboPopStreak/);
  assert.match(source, /onAnimationEnd/);
  assert.match(source, /className="hud-cell hud-progress"[\s\S]*?className="combo-pop"/);

  assert.match(settingsSource, /THEMES\.map/);
  assert.match(settingsSource, /<dialog/);
  assert.match(settingsSource, /aria-modal="true"/);
  assert.match(settingsSource, /INTERFACE THEME/);
  assert.match(settingsSource, /data-theme-id=\{theme\.id\}/);
  assert.match(settingsSource, /theme-option-preview/);
  assert.match(settingsSource, /theme-option-preview-board/);
  assert.match(settingsSource, /aria-label="테마 설정 닫기"/);
  assert.match(settingsSource, /aria-hidden="true">×<\/span>/);
  assert.doesNotMatch(settingsSource, /ESC<\/kbd> CLOSE/);

  assert.match(themesSource, /export const DEFAULT_THEME_ID: ThemeId = "polar-white"/);
  assert.match(themesSource, /export const THEMES = \[/);
  assert.match(themesSource, /export function getTheme/);

  const comboRule = themeStyles.match(/\.combo-pop \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(comboRule, /inset:\s*0/);
  assert.match(comboRule, /width:\s*100%/);
  assert.match(comboRule, /pointer-events:\s*none/);
  assert.doesNotMatch(comboRule, /left:\s*50%/);
  assert.match(themeStyles, /@keyframes theme-combo-pop[\s\S]*?100%\s*\{[\s\S]*?opacity:\s*0/);
});
