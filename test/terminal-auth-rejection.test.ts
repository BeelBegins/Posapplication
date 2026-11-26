import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHttpCore } from "../src/core/http";
import type { PosCoreDeps } from "../src/core/types";

// A server restart once made a till say its working API key was invalid. Only
// HTTP 401 may mean that; every other failure must leave the key alone.
function core(reply: () => Promise<Response>) {
  const deps = {
    db: {
      loadSettings: () => ({ erpnextUrl: "https://erp.example.com", apiKey: "key", apiSecret: "secret", posProfile: "Till 1" }),
      getOrCreateHardwareId: () => "hardware-1",
    },
    fetch: async () => reply(),
  } as unknown as PosCoreDeps;
  return createHttpCore(deps);
}
const answer = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status });

test("only HTTP 401 reports the terminal key as rejected", async () => {
  assert.equal((await core(answer(401)).testApiAuthentication()).rejected, true);
  for (const status of [403, 417, 500, 502, 503, 504]) {
    const result = await core(answer(status)).testApiAuthentication();
    assert.deepEqual([result.success, result.rejected], [false, false], `HTTP ${status}`);
  }
});

test("a network failure or an unreadable reply does not blame the key", async () => {
  const down = await core(async () => { throw new Error("connect ECONNREFUSED"); }).testApiAuthentication();
  assert.deepEqual([down.success, down.rejected], [false, false]);
  const portal = await core(async () => new Response("<html>sign in</html>", { status: 200 })).testApiAuthentication();
  assert.deepEqual([portal.success, portal.rejected], [false, false]);
});

test("a good reply signs in", async () => {
  assert.deepEqual(await core(answer(200, { message: "till@example.com" })).testApiAuthentication(),
    { success: true, loggedUser: "till@example.com", rejected: false });
});

test("gateway errors count as offline so the till uses its offline path", async () => {
  for (const status of [502, 503, 504]) assert.equal((await core(answer(status)).testServerReachability()).connected, false, `HTTP ${status}`);
  for (const status of [200, 401, 403, 500]) assert.equal((await core(answer(status)).testServerReachability()).connected, true, `HTTP ${status}`);
});

test("startup keeps a working key out of settings unless ERP refused it", () => {
  const renderer = readFileSync("src/renderer/renderer.ts", "utf8");
  const guard = renderer.indexOf("if (!login.rejected)");
  assert.ok(guard > 0 && guard < renderer.indexOf("Authentication failed. The API key or secret is invalid."));
  assert.match(renderer, /if \(!server\.connected\) \{ await startWithoutServer\(/);
});
