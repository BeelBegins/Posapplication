import assert from "node:assert/strict";
import test from "node:test";
import { formatDateRange, formatDateTime, formatDay, formatMonthOf, formatTime, statusTone } from "../src/products/hr/domain";

test("formatDay / formatDateTime / formatTime use ERP wall-clock", () => {
  assert.equal(formatDay("2026-11-17"), "Tue 17 Nov");
  assert.equal(formatDateTime("2026-11-17 09:02:11"), "Tue 17 Nov · 09:02");
  assert.equal(formatDateTime("2026-11-17T23:59:00"), "Tue 17 Nov · 23:59");
  assert.equal(formatDateTime("2026-11-17"), "Tue 17 Nov");
  assert.equal(formatTime("2026-11-17 09:02:11"), "09:02");
  assert.equal(formatTime("2026-11-17"), "");
  assert.equal(formatDay("garbage"), "garbage");
  assert.equal(formatDay(undefined), "");
});

test("formatDateRange", () => {
  assert.equal(formatDateRange("2026-11-20", "2026-11-20"), "20 Nov");
  assert.equal(formatDateRange("2026-11-20", "2026-11-22"), "20–22 Nov");
  assert.equal(formatDateRange("2026-11-30", "2026-12-02"), "30 Nov – 2 Dec");
  assert.equal(formatDateRange("2026-12-30", "2027-01-02"), "30 Dec – 2 Jan 2027");
  assert.equal(formatDateRange("", "2026-01-01"), "");
});

test("formatMonthOf and statusTone", () => {
  assert.equal(formatMonthOf("2026-11-01"), "November 2026");
  assert.equal(statusTone("Approved"), "success");
  assert.equal(statusTone("Rejected"), "danger");
  assert.equal(statusTone("Open"), "warning");
  assert.equal(statusTone("Something"), "info");
});
