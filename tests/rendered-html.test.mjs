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

test("server-renders the KEY//DODGE game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>KEY\/\/DODGE/);
  assert.match(html, /QWERTY RHYTHM SURVIVAL/);
  assert.match(html, /SURVIVE THE SEQUENCE/);
  assert.match(html, /BOOT_SEQUENCE/);
  assert.match(html, /게임 시작/);
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
  assert.match(source, /ROUND_SECONDS/);
  assert.match(source, /MAX_HP/);
});
