import assert from "node:assert/strict";
import test from "node:test";
import { advanceBalance, advanceRequest, approvalAction, approvalItems, base64FromDataUrl, canWithdrawLeave, expenseClaimRequest, formatBytes, formatFullDate, profileUpdates, safePdfName, uploadProblem } from "../src/products/hr/selfservice";

test("approvalItems keeps only pending requests and normalises fields", () => {
  const items = approvalItems({
    leave: [{ name: "L1", employee_name: "Sara", leave_type: "Annual", status: "Open", from_date: "2026-11-24", to_date: "2026-11-26", total_leave_days: 3 }, { name: "L2", status: "Approved" }],
    expenses: [{ name: "E1", employee: "EMP-1", expense_type: "Travel", approval_status: "Draft", total_claimed_amount: "7450", currency: "PKR", total_expenses: 2 }, { name: "E2", approval_status: "Rejected" }],
    shifts: [{ name: "S1", shift_type: "Evening", status: "Draft" }, { status: "Draft" }],
  });
  assert.deepEqual(items.map((item) => `${item.doctype}:${item.name}`), ["Leave Application:L1", "Expense Claim:E1", "Shift Request:S1"]);
  assert.equal(items[0].detail, "3 days");
  assert.equal(items[1].employee, "EMP-1");
  assert.equal(items[1].amount, 7450);
  assert.equal(items[1].detail, "2 items");
  assert.deepEqual(approvalItems(null), []);
  assert.deepEqual(approvalItems({ leave: "x", expenses: [null, 5] }), []);
});

test("approvalAction validates doctype and decision", () => {
  assert.deepEqual(approvalAction("Leave Application", " L1 ", "approve", " ok "), { doctype: "Leave Application", name: "L1", action: "approve", reason: "ok" });
  assert.throws(() => approvalAction("Salary Slip", "X", "approve"));
  assert.throws(() => approvalAction("Expense Claim", "", "approve"));
  assert.throws(() => approvalAction("Expense Claim", "E1", "delete"));
  assert.equal(approvalAction("Shift Request", "S1", "reject", "x".repeat(900)).reason.length, 500);
});

test("expenseClaimRequest validates inputs and rejects client authority", () => {
  assert.deepEqual(expenseClaimRequest({ expenseDate: "2026-11-18", expenseType: " Travel ", amount: "1,250.456", description: " taxi ", today: "2026-11-19" }), { expense_date: "2026-11-18", expense_type: "Travel", amount: 1250.46, description: "taxi" });
  assert.throws(() => expenseClaimRequest({ expenseDate: "2026-11-20", expenseType: "Travel", amount: "5", today: "2026-11-19" }), /future/);
  assert.throws(() => expenseClaimRequest({ expenseDate: "", expenseType: "Travel", amount: "5" }));
  assert.throws(() => expenseClaimRequest({ expenseDate: "2026-11-18", expenseType: " ", amount: "5" }));
  for (const amount of ["0", "-3", "abc", "", "1e13"]) assert.throws(() => expenseClaimRequest({ expenseDate: "2026-11-18", expenseType: "Travel", amount }), Error, amount);
  assert.throws(() => expenseClaimRequest({ expenseDate: "2026-11-18", expenseType: "Travel", amount: "5" }, { employee: "HR-EMP-1" }));
});

test("advanceRequest validates purpose and amount", () => {
  assert.deepEqual(advanceRequest({ purpose: " Trip ", amount: "20000" }), { purpose: "Trip", advance_amount: 20000 });
  assert.throws(() => advanceRequest({ purpose: "", amount: "5" }));
  assert.throws(() => advanceRequest({ purpose: "Trip", amount: "0" }));
});

test("profileUpdates sends only changed whitelisted fields", () => {
  const original = { cell_number: "+92 300 1234567", personal_email: "a@example.com", current_address: "Old", status: "Active" };
  assert.equal(profileUpdates({ cell_number: "+92 300 1234567 ", personal_email: "a@example.com" }, original), null);
  assert.deepEqual(profileUpdates({ cell_number: "+92 300 7654321", current_address: "", status: "Left" } as Record<string, string>, original), { cell_number: "+92 300 7654321", current_address: "" });
  assert.throws(() => profileUpdates({ personal_email: "nope" }, original), /email/);
  assert.throws(() => profileUpdates({ emergency_phone_number: "call me" }, original), /phone/);
});

test("uploadProblem enforces type and size", () => {
  assert.equal(uploadProblem({ name: "cnic.JPG", size: 1000 }), null);
  assert.equal(uploadProblem({ name: "degree.pdf", size: 5 * 1024 * 1024 }), null);
  assert.match(uploadProblem({ name: "x.pdf", size: 5 * 1024 * 1024 + 1 }) || "", /5 MB/);
  assert.match(uploadProblem({ name: "run.exe", size: 10 }) || "", /PDF, JPG and PNG/);
  assert.match(uploadProblem({ name: "x.png", size: 0 }) || "", /empty/);
  assert.match(uploadProblem(null) || "", /Choose/);
});

test("small helpers", () => {
  assert.equal(base64FromDataUrl("data:application/pdf;base64,QUJD"), "QUJD");
  assert.equal(base64FromDataUrl("QUJD"), "QUJD");
  assert.equal(advanceBalance({ paid_amount: 20000, claimed_amount: 12500, return_amount: 1000 }), 6500);
  assert.equal(advanceBalance({ paid_amount: 100, claimed_amount: 150 }), 0);
  assert.equal(canWithdrawLeave({ name: "L1", status: "Open" }), true);
  assert.equal(canWithdrawLeave({ name: "L1", status: "Open", docstatus: 1 }), false);
  assert.equal(canWithdrawLeave({ name: "L1", status: "Approved" }), false);
  assert.equal(canWithdrawLeave({ status: "Open" }), false);
  assert.equal(formatBytes(1830000), "1.7 MB");
  assert.equal(formatBytes(412000), "402 KB");
  assert.equal(safePdfName("payslip-2026-11.pdf"), "payslip-2026-11.pdf");
  assert.equal(safePdfName("../evil name"), "evil-name.pdf");
  assert.equal(safePdfName(""), "payslip.pdf");
});

test("formatFullDate keeps the year and rejects invalid dates", () => {
  assert.equal(formatFullDate("2021-03-01"), "1 Mar 2021");
  assert.equal(formatFullDate("2026-11-19 09:00:00"), "19 Nov 2026");
  assert.equal(formatFullDate("2026-02-30"), "");
  assert.equal(formatFullDate(""), "");
  assert.equal(formatFullDate(null), "");
});
