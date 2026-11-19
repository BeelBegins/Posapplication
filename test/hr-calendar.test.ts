import assert from "node:assert/strict";
import test from "node:test";
import { attendanceRequest, calendarWeeks, checkinAreaText, dayTone, monthLabel, shiftMonth } from "../src/products/hr/domain";

const evidence = { logType: "IN" as const, latitude: 24.86, longitude: 67.01, challenge: "x".repeat(40), image: "data:image/jpeg;base64,AAAA" };

test("attendanceRequest sends rounded GPS accuracy only when valid", () => {
  assert.equal(attendanceRequest({ ...evidence, accuracy: 12.345 }).accuracy, 12.3);
  for (const bad of [undefined, null, 0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal("accuracy" in attendanceRequest({ ...evidence, accuracy: bad as number }), false);
  }
});

test("shiftMonth crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-11", 0), "2026-11");
  assert.throws(() => shiftMonth("2026-1", 1));
});

test("monthLabel", () => assert.equal(monthLabel("2026-11"), "November 2026"));

test("calendarWeeks builds Monday-first padded weeks", () => {
  // 1 Nov 2026 is a Sunday -> 6 leading blanks; 30 days -> 36 cells -> 6 weeks.
  const weeks = calendarWeeks("2026-11", [{ date: "2026-11-02", status: "Present" }]);
  assert.equal(weeks.length, 6);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.equal(weeks[0].slice(0, 6).every((cell) => cell.dayOfMonth === null), true);
  assert.equal(weeks[0][6].dayOfMonth, 1);
  assert.equal(weeks[1][0].day?.status, "Present");
  assert.deepEqual(calendarWeeks("bad", []), []);
});

test("dayTone maps statuses", () => {
  assert.equal(dayTone("Work From Home"), "present");
  assert.equal(dayTone("On Leave"), "leave");
  assert.equal(dayTone("Weekly Off"), "off");
  assert.equal(dayTone("No Record"), "none");
});

test("checkinAreaText explains the policy", () => {
  assert.equal(checkinAreaText({ enforced: false }), "Location is recorded with each check-in.");
  assert.match(checkinAreaText({ enforced: true, required: true, location: null }), /Ask HR/);
  assert.equal(checkinAreaText({ enforced: true, location: { location_name: "HO", radius_m: 150.4 } }), "Check in within 150 m of HO.");
});
