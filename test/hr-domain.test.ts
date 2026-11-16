import assert from "node:assert/strict";
import test from "node:test";
import {
  FACE_CONSENT_VERSION,
  attendanceCorrectionRequest,
  attendanceRequest,
  cameraPermissionDeniedMessage,
  canManageFaceEnrollment,
  canSubmitEnrollment,
  enrollFaceRequest,
  enrollmentPromptForIndex,
  leaveRequest,
} from "../src/products/hr/domain";

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

test("face enrollment is manager-gated and consent-bound", () => {
  assert.equal(canManageFaceEnrollment(["Employee"]), false);
  assert.equal(canManageFaceEnrollment(["HR Manager"]), true);
  assert.equal(canManageFaceEnrollment(["System Manager"]), true);
  const jpeg = "data:image/jpeg;base64," + "a".repeat(40);
  const body = enrollFaceRequest({
    employee: "HR-EMP-00063",
    images: [jpeg, jpeg, jpeg],
    consent: true,
  });
  assert.deepEqual(Object.keys(body).sort(), ["consent", "consent_version", "employee", "images"]);
  assert.equal(body.consent_version, FACE_CONSENT_VERSION);
  assert.equal(body.employee, "HR-EMP-00063");
  assert.equal(canSubmitEnrollment({ employee: "HR-EMP-00063", images: [jpeg, jpeg, jpeg], consent: true }), true);
  assert.equal(canSubmitEnrollment({ employee: "HR-EMP-00063", images: [jpeg, jpeg], consent: true }), false);
  assert.equal(canSubmitEnrollment({ employee: "HR-EMP-00063", images: [jpeg, jpeg, jpeg], consent: true, busy: true }), false);
  assert.match(enrollmentPromptForIndex(0), /oval|centre|camera/i);
  assert.match(String(cameraPermissionDeniedMessage(new Error("NotAllowedError"))), /Camera permission/i);
  assert.throws(() => enrollFaceRequest({ employee: "HR-EMP-00063", images: [jpeg], consent: true }), /3 to 5/);
  assert.throws(() => enrollFaceRequest({ employee: "HR-EMP-00063", images: [jpeg, jpeg, jpeg], consent: false }), /consent/);
});
