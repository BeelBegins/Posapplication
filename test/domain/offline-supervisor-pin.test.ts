import assert from "node:assert/strict";
import test from "node:test";
import { scryptSync } from "node:crypto";
import { checkOfflineSupervisorPin, OFFLINE_PIN_MAX_FAILURES, parseSupervisorPinResponse, type OfflinePinLock } from "../../src/domain/offline-supervisor-pin";

// Hash made by aimatic.offline_pos.supervisor_pin.hash_pin("1234", salt) on the server.
const SERVER_HASH = "scrypt:v1:00112233445566778899aabbccddeeff:bd32905894891fff625cb7f496cbf8b7f9ef0cee823bd0aceda87857c65a77d9";
const verify = (pin: string, stored: string) => { const [, , salt, hex] = stored.split(":"); return scryptSync(pin, salt, 32).toString("hex") === hex; };
const now = new Date("2026-11-08T10:00:00Z");
const cache = parseSupervisorPinResponse({ pos_profile: "S2 Counter 2", valid_until: "2026-11-15T10:00:00", supervisors: [{ user: "Sup@szl", full_name: "Sup One", pin_hash: SERVER_HASH }, { user: "bad@szl", pin_hash: "plain" }] }, "S2 Counter 2", now);
const free: OfflinePinLock = { failed: 0, lockUntil: 0 };
const check = (over: Partial<Parameters<typeof checkOfflineSupervisorPin>[0]> = {}) =>
  checkOfflineSupervisorPin({ cache, posProfile: "S2 Counter 2", username: "sup@szl", pin: "1234", action: "void_item", lock: free, now, verify, ...over });

test("server-made hash verifies on the till and returns the supervisor", () => {
  assert.equal(cache?.supervisors.length, 1, "rows without a scrypt hash are dropped");
  const r = check();
  assert.equal(r.ok, true);
  assert.equal(r.user, "Sup@szl");
  assert.equal(r.fullName, "Sup One");
});

test("only void and clear cart, only for the synced profile, only before expiry", () => {
  assert.equal(check({ action: "refund" }).ok, false);
  assert.equal(check({ action: "close_shift" }).ok, false);
  assert.equal(check({ action: "clear_cart" }).ok, true);
  assert.equal(check({ posProfile: "S1GT Counter 1" }).ok, false);
  assert.equal(check({ now: new Date("2026-11-16T00:00:00Z") }).ok, false);
  assert.equal(check({ cache: null }).ok, false);
  assert.equal(parseSupervisorPinResponse({ pos_profile: "Other", valid_until: "2026-11-15", supervisors: [] }, "S2 Counter 2"), null);
});

test("wrong PIN or unknown user counts toward a terminal lockout", () => {
  let lock = free;
  for (let i = 0; i < OFFLINE_PIN_MAX_FAILURES; i++) {
    const r = check({ pin: "9999", username: i % 2 ? "nobody@szl" : "sup@szl", lock });
    assert.equal(r.ok, false);
    lock = r.lock;
  }
  assert.ok(lock.lockUntil > now.getTime());
  const locked = check({ lock });
  assert.equal(locked.ok, false, "even the right PIN is refused while locked");
  assert.match(locked.error ?? "", /Too many wrong PINs/);
  assert.equal(check({ lock, now: new Date(lock.lockUntil + 1) }).ok, true);
});
