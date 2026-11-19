// Pure helpers for the Phase 2 phone self-service screens (no DOM, no network).
import { rejectClientAuthority } from "./domain";

type Row = Record<string, unknown>;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const PROFILE_FIELDS = [
  ["cell_number", "Mobile number", "tel"],
  ["personal_email", "Personal email", "email"],
  ["current_address", "Current address", "textarea"],
  ["permanent_address", "Permanent address", "textarea"],
  ["person_to_be_contacted", "Emergency contact", "text"],
  ["emergency_phone_number", "Emergency phone", "tel"],
  ["relation", "Relation", "text"],
] as const;
export type ProfileField = typeof PROFILE_FIELDS[number][0];

export type ApprovalDoctype = "Leave Application" | "Expense Claim" | "Shift Request";
export interface ApprovalItem { doctype: ApprovalDoctype; name: string; employee: string; title: string; detail: string; from?: string; to?: string; amount?: number; currency?: string }

const str = (value: unknown) => (value == null ? "" : String(value));
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter((entry): entry is Row => Boolean(entry) && typeof entry === "object") : []);

/** Flatten get_approvals() into one list, newest first per group, only items still pending. */
export function approvalItems(payload: unknown): ApprovalItem[] {
  const data = (payload && typeof payload === "object" ? payload : {}) as Row;
  const items: ApprovalItem[] = [];
  for (const row of rows(data.leave)) {
    if (str(row.status || "Open") !== "Open" || !str(row.name)) continue;
    items.push({ doctype: "Leave Application", name: str(row.name), employee: str(row.employee_name || row.employee), title: str(row.leave_type) || "Leave", detail: str(row.total_leave_days ? `${row.total_leave_days} day${Number(row.total_leave_days) === 1 ? "" : "s"}` : ""), from: str(row.from_date), to: str(row.to_date) });
  }
  for (const row of rows(data.expenses)) {
    if (str(row.approval_status || "Draft") !== "Draft" || !str(row.name)) continue;
    items.push({ doctype: "Expense Claim", name: str(row.name), employee: str(row.employee_name || row.employee), title: str(row.expense_type) || "Expense claim", detail: Number(row.total_expenses) > 1 ? `${row.total_expenses} items` : "", from: str(row.posting_date), amount: Number(row.total_claimed_amount) || 0, currency: str(row.currency) });
  }
  for (const row of rows(data.shifts)) {
    if (str(row.status || "Draft") !== "Draft" || !str(row.name)) continue;
    items.push({ doctype: "Shift Request", name: str(row.name), employee: str(row.employee_name || row.employee), title: str(row.shift_type) || "Shift request", detail: "", from: str(row.from_date), to: str(row.to_date) });
  }
  return items;
}

export function approvalAction(doctype: string, name: string, decision: string, reason = ""): Record<string, string> {
  if (!["Leave Application", "Expense Claim", "Shift Request"].includes(doctype)) throw new Error("This request cannot be decided from the app.");
  if (!name.trim()) throw new Error("Missing request.");
  if (decision !== "approve" && decision !== "reject") throw new Error("Choose approve or reject.");
  return { doctype, name: name.trim(), action: decision, reason: reason.trim().slice(0, 500) };
}

function positiveAmount(raw: string, label: string): number {
  const value = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be more than zero.`);
  if (value > 1e12) throw new Error(`${label} is too large.`);
  return Math.round(value * 100) / 100;
}

export function expenseClaimRequest(input: { expenseDate: string; expenseType: string; amount: string; description?: string; today?: string }, extras: Record<string, unknown> = {}) {
  rejectClientAuthority(extras);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate || "")) throw new Error("Pick the expense date.");
  if (input.today && input.expenseDate > input.today) throw new Error("The expense date cannot be in the future.");
  if (!input.expenseType.trim()) throw new Error("Choose an expense type.");
  return { expense_date: input.expenseDate, expense_type: input.expenseType.trim(), amount: positiveAmount(input.amount, "Amount"), description: (input.description || "").trim().slice(0, 1000) };
}

export function advanceRequest(input: { purpose: string; amount: string }, extras: Record<string, unknown> = {}) {
  rejectClientAuthority(extras);
  if (!input.purpose.trim()) throw new Error("Say what the advance is for.");
  return { purpose: input.purpose.trim().slice(0, 1000), advance_amount: positiveAmount(input.amount, "Advance amount") };
}

/** Only changed, whitelisted fields; null when nothing changed. */
export function profileUpdates(form: Record<string, string>, original: Row): Record<string, string> | null {
  const updates: Record<string, string> = {};
  for (const [key] of PROFILE_FIELDS) {
    if (!(key in form)) continue;
    const next = (form[key] ?? "").trim();
    if (next !== str(original[key]).trim()) updates[key] = next;
  }
  if (updates.personal_email && !/^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(updates.personal_email)) throw new Error("Enter a valid personal email.");
  for (const key of ["cell_number", "emergency_phone_number"]) {
    if (updates[key] && !/^\+?[0-9][0-9 ()-]{5,19}$/.test(updates[key])) throw new Error("Enter a valid phone number.");
  }
  return Object.keys(updates).length ? updates : null;
}

export function uploadProblem(file: { name: string; size: number; type?: string } | null | undefined): string | null {
  if (!file) return "Choose a file first.";
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return "Only PDF, JPG and PNG files can be uploaded.";
  if (file.size <= 0) return "The file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "Files must be 5 MB or smaller.";
  return null;
}

export function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function advanceBalance(row: Row): number {
  const paid = Number(row.paid_amount) || 0;
  return Math.max(0, paid - (Number(row.claimed_amount) || 0) - (Number(row.return_amount) || 0));
}

export function canWithdrawLeave(row: Row): boolean {
  return str(row.status || "Open") === "Open" && Number(row.docstatus || 0) === 0 && Boolean(str(row.name));
}

export function formatBytes(size: unknown): string {
  const n = Number(size) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function safePdfName(name: unknown): string {
  const raw = str(name).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "");
  return /\.pdf$/i.test(raw) ? raw : `${raw || "payslip"}.pdf`;
}
