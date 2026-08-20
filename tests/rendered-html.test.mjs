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
  assert.match(html, /QWERTY RHYTHM ACTION/);
  assert.match(html, /06 STAGES/);
  assert.match(html, /STAGE MAP 열기/);
  assert.match(html, /실제 키보드를 전장으로/);
  assert.match(html, /82—156/);
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
  assert.match(source, /AUTO RECENTER/);
  assert.match(source, /ZONE EXPAND/);
  assert.match(source, /TEMPO DOWN/);
  assert.match(source, /STAGES\.find/);
  assert.match(source, /`Key\$\{stage\.selectKey\}`/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /data-stage-id/);
  assert.match(source, /countdownStartedAtRef\.current \+ beatMs/);
  assert.match(source, /focusedStageId/);
  assert.match(source, /getStageSelectionAction\(focusedStageId, stageId\)/);
  assert.match(source, /chooseStage/);
  assert.match(source, /PRESS \$\{stage\.selectKey\} AGAIN TO START/);
  assert.match(source, /phase !== "countdown"/);
  assert.match(source, /COUNTDOWN_BEATS/);
  assert.match(source, /countdownValue/);
  assert.match(source, /nextBeatAt/);
  assert.match(source, /TEMPO SYNC/);
  assert.match(source, /cancelCountdown/);
  assert.match(source, /showTitle/);
  assert.match(source, /nextStage/);
  assert.match(source, /pausedAttackRef/);
  assert.match(source, /pausedInvulnerabilityRef/);
  assert.match(source, /remainingMs/);
  assert.match(source, /isNativeButtonActivation/);
  assert.match(source, /getCompletedWaveCount/);
  assert.match(source, /getAttackPattern/);
  assert.match(source, /resolveHeal/);
  assert.match(source, /lastInputRef/);
  assert.match(source, /playerThreatened/);
  assert.match(source, /현재 위치 KEY_/);
  assert.match(source, /MOVE!/);
  assert.match(source, /ONLY SAFE/);
  assert.match(source, /HEAL \+1/);
});
