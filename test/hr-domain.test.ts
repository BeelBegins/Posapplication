import assert from "node:assert/strict";
import test from "node:test";
import { attendanceCorrectionRequest, attendanceRequest, leaveRequest } from "../src/products/hr/domain";

const evidence = {
  logType: "IN" as const,
  latitude: 24.86,
  longitude: 67.01,
  challenge: "a".repeat(32),
  image: "data:image/jpeg;base64,abc",
};

test("attendance submission omits employee, time, and verification claims", () => {
  const body = attendanceRequest(evidence, { note: "ignored-safe" });
  assert.deepEqual(Object.keys(body).sort(), ["challenge", "image", "latitude", "log_type", "longitude"]);
  assert.equal("employee" in body, false);
  assert.equal("time" in body, false);
  assert.equal("verified" in body, false);
  assert.throws(() => attendanceRequest(evidence, { employee: "EMP-2", verified: true }), /server/);
});

test("leave and attendance requests cannot carry a client employee", () => {
  const leave = leaveRequest({ leaveType: "Casual Leave", fromDate: "2026-11-18", toDate: "2026-11-18" }, {});
  const correction = attendanceCorrectionRequest({ fromDate: "2026-11-18", toDate: "2026-11-18", reason: "On Duty" });
  assert.equal("employee" in leave, false);
  assert.equal("employee" in correction, false);
  assert.throws(() => leaveRequest({ leaveType: "Casual Leave", fromDate: "2026-11-18", toDate: "2026-11-18" }, { employee: "EMP-9" }), /server/);
  assert.throws(() => attendanceCorrectionRequest({ fromDate: "2026-11-18", toDate: "2026-11-18", reason: "On Duty" }, { time: "09:00" }), /server/);
});
