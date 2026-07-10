import type { PosCoreDeps } from "./types";
import type { createHttpCore } from "./http";
import type { createPosSessionCore } from "./pos-session";
import { asRecord, textValue, formatResponseError, getResponseError } from "./http";
import type { HeldSaleInput, SalesHistoryFilter } from "../db/database";

function isCashierPermissionSyncError(message: string): boolean {
  return /cashier|user|employee|permission|disabled|not allowed|not permitted|pos profile/i.test(message);
}

// The receipt is an ERPNext Print Format (POS Invoice), not a custom API method — render it via the standard print view.
function thermalReceiptCss(): string {
  return `<style>
    @page { size: 80mm auto; margin: 2mm; }
    @media print {
      html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      button, input, select, textarea, .btn, .print-toolbar, .page-head, .navbar, #navbar, .web-footer, footer,
      .btn-print-preview, .print-preview-select, .print-preview-toolbar, .print-actions,
      a[href*="download_pdf"], a[href*="pdf"] { display: none !important; }
      .rc-item, .rc-totals, .rc-fbr, .rc-footer { break-inside: avoid; page-break-inside: avoid; }
    }
    html, body, .print-format, .pos-receipt {
      font-family: Calibri, Arial, sans-serif !important;
      color: #000 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-variant-numeric: tabular-nums;
    }
    body { margin: 0 !important; padding: 0 !important; }
    .print-format, .pos-receipt {
      width: 80mm !important; max-width: 80mm !important; margin: 0 auto !important;
      padding: 3mm 3mm 4mm !important; box-sizing: border-box !important;
      font-size: 11px !important; line-height: 1.35 !important;
    }
    .rc-company { font-size: 18px !important; font-weight: 800 !important; color: #000 !important; }
    .rc-title { font-size: 15px !important; font-weight: 800 !important; color: #000 !important; }
    .rc-meta, .rc-meta-row, .rc-fbr-row, .rc-fbr-inv { font-size: 11px !important; color: #000 !important; font-weight: 700 !important; }
    .rc-meta-lbl, .rc-item-code, .rc-item-nums .c-desc, .rc-terms, .rc-footer { color: #000 !important; }
    .rc-col-hdr { display: grid !important; grid-template-columns: minmax(0,1fr) 16mm 20mm 22mm !important; gap: 1.5mm !important; font-size: 10px !important; color: #000 !important; font-weight: 800 !important; }
    .rc-item-name { font-size: 11px !important; font-weight: 800 !important; color: #000 !important; overflow: visible !important; display: block !important; }
    .rc-item-nums { display: grid !important; grid-template-columns: minmax(0,1fr) 16mm 20mm 22mm !important; gap: 1.5mm !important; font-size: 10px !important; color: #000 !important; font-weight: 700 !important; }
    .rc-item-nums .c-num, .rc-col-hdr .c-num { width: auto !important; text-align: right !important; white-space: nowrap !important; }
    .rc-item { padding: 2px 1px !important; border-bottom: 1px dotted #999 !important; }
    .rc-item-code { display: none !important; }
    .rc-item-tax { margin-top: 1px !important; padding: 1px 2px !important; border-left: 0 !important; background: transparent !important; font-size: 9.5px !important; line-height: 1.15 !important; color: #000 !important; font-weight: 800 !important; }
    .rc-item-tax-3rd, .rc-item-disc { display: none !important; }
    .rc-tot-row { font-size: 12px !important; color: #000 !important; font-weight: 700 !important; }
    .rc-tot-row.grand { font-size: 16px !important; font-weight: 900 !important; color: #000 !important; }
    .rc-tot-amt { white-space: nowrap !important; font-variant-numeric: tabular-nums; }
    .rc-fbr-title { font-size: 12px !important; font-weight: 900 !important; color: #000 !important; }
    .rc-fbr-inv b, .rc-fbr-row span:last-child { font-weight: 900 !important; color: #000 !important; }
    .rc-footer { font-size: 10px !important; color: #000 !important; }
    .rc-fbr-qr img, .rc-gv-qr img, .receipt-qr-img { width: 70px !important; height: 70px !important; image-rendering: crisp-edges; }
    .duplicate-copy, .return-copy { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; font: 900 15px Calibri, Arial, sans-serif !important; border: 2px solid #000 !important; color: #000 !important; padding: 5px !important; margin: 0 0 6px !important; letter-spacing: 1px !important; text-transform: uppercase !important; break-after: avoid !important; page-break-after: avoid !important; }
  </style>`;
}

function toHeldInput(raw: Record<string, unknown>): HeldSaleInput {
  return {
    terminalInvoiceId: String(raw.terminalInvoiceId ?? ""), displayName: String(raw.displayName ?? ""),
    customer: String(raw.customer ?? ""), customerName: String(raw.customerName ?? ""),
    posProfile: String(raw.posProfile ?? ""), company: String(raw.company ?? ""), branch: String(raw.branch ?? ""), openingEntry: String(raw.openingEntry ?? ""),
    cart: Array.isArray(raw.cart) ? raw.cart : [], payments: Array.isArray(raw.payments) ? raw.payments : [],
    benefits: asRecord(raw.benefits) ?? {}, totals: asRecord(raw.totals) ?? {}, validationSnapshot: asRecord(raw.validationSnapshot) ?? {},
    itemCount: Number(raw.itemCount) || 0, estimatedTotal: Number(raw.estimatedTotal) || 0
  };
}

function toHistoryFilter(raw: Record<string, unknown>): SalesHistoryFilter {
  return { search: String(raw.search ?? ""), dateFrom: String(raw.dateFrom ?? ""), dateTo: String(raw.dateTo ?? ""), limit: Number(raw.limit) || 50, offset: Number(raw.offset) || 0 };
}

/**
 * Sale submission (online + offline queue), receipt retrieval, and refund submission —
 * the highest-business-risk group (money, offline durability, refunds). Depends on the
 * already-bound http core (testApiAuthentication) and pos-session core (cart/terminal
 * identity, offline-batch helpers, startPosSession for converting a queued offline batch
 * into a real POS Opening Entry).
 */
export function createSaleRefundCore(
  deps: PosCoreDeps,
  http: ReturnType<typeof createHttpCore>,
  posSession: ReturnType<typeof createPosSessionCore>
) {
  function buildSalePayload(input: Record<string, unknown>): Record<string, unknown> {
    const settings = deps.db.loadSettings();
    const id = String(input.terminal_invoice_id || posSession.getTerminalInvoiceId());
    const identity = posSession.getCartIdentity();
    const requestedOpening = String(input.opening_entry || identity.openingEntry || "");
    const offlineAuthenticated = Boolean(input.offline_authenticated);
    const openingEntry = offlineAuthenticated ? "" : posSession.realOpeningEntry(requestedOpening);
    let localOfflineSessionId = String(input.local_offline_session_id || "").trim();
    if (!localOfflineSessionId && posSession.isOfflineBatchId(requestedOpening)) localOfflineSessionId = requestedOpening.trim();
    if (!localOfflineSessionId && offlineAuthenticated) localOfflineSessionId = identity.offlineBatchId || posSession.getOfflineBatchId(identity.terminalId);
    return {
      terminal_invoice_id: id,
      terminal_id: identity.terminalId,
      pos_profile: settings.posProfile,
      opening_entry: openingEntry,
      local_offline_session_id: localOfflineSessionId,
      cashier_user: String(input.cashier_user ?? ""),
      cashier_full_name: String(input.cashier_full_name ?? ""),
      offline_authenticated: Boolean(input.offline_authenticated),
      offline_auth_method: String(input.offline_auth_method ?? ""),
      created_at: String(input.created_at ?? new Date().toISOString()),
      customer: String(input.customer ?? ""),
      items: Array.isArray(input.items) ? input.items : [],
      payments: Array.isArray(input.payments) ? input.payments : [],
      coupon_code: String(input.coupon_code ?? ""),
      gift_voucher_code: String(input.gift_voucher_code ?? ""),
      redeem_loyalty_points: Boolean(input.redeem_loyalty_points),
      loyalty_points: Number(input.loyalty_points ?? 0),
      estimated_total: Number(input.estimated_total ?? 0)
    };
  }

  // A local stand-in for the server response so the receipt + history have coherent data until the sale syncs.
  function buildProvisionalResponse(id: string, payload: Record<string, unknown>): Record<string, unknown> {
    return { provisional: true, offline: true, queued: true, terminal_invoice_id: id, pos_invoice: id, posting_datetime: new Date().toISOString(), fbr_status: "Awaiting internet availability", fbr_invoice_number: "Pending", fbr_response: "Will submit automatically when ERPNext is online", estimated_total: posSession.numValue(payload, "estimated_total") };
  }

  // Persist a completed-offline sale to the queue (status "Queued"); it replays to the server on reconnect.
  function queueSale(input: Record<string, unknown>): { success: boolean; response: Record<string, unknown> | null; error: string | null; queued: boolean } {
    const payload = buildSalePayload(input);
    const id = String(payload.terminal_invoice_id);
    const response = buildProvisionalResponse(id, payload);
    deps.db.saveSaleHistory(id, "Queued", payload, response);
    return { success: true, response, error: null, queued: true };
  }

  async function submitOnlineSale(input: Record<string, unknown>): Promise<{ success: boolean; response: Record<string, unknown> | null; error: string | null; queued?: boolean }> {
    const settings = deps.db.loadSettings();
    const payload = buildSalePayload(input);
    const id = String(payload.terminal_invoice_id);
    deps.db.saveSaleHistory(id, "Submitting", payload);
    if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret) {
      deps.db.saveSaleHistory(id, "Failed", payload);
      return { success: false, response: null, error: "ERPNext URL and API credentials are required." };
    }
    try {
      const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      const response = await deps.fetch(`${base}/api/method/aimatic.offline_pos.api.submit_online_sale`, { method: "POST", headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const rawBody = await response.text();
      let parsed: { message?: unknown; data?: unknown } = {};
      try { parsed = JSON.parse(rawBody) as { message?: unknown; data?: unknown }; } catch { /* non-JSON response */ }
      const result = asRecord(parsed.message) ?? asRecord(parsed.data) ?? {};
      if (!response.ok) {
        deps.db.saveSaleHistory(id, "Failed", payload, result);
        return { success: false, response: result, error: formatResponseError(response.status, response.statusText, rawBody) };
      }
      deps.db.saveSaleHistory(id, "Submitted", payload, result);
      return { success: true, response: result, error: null };
    } catch {
      // Network failure mid-submit: auto-fall back to the offline queue rather than failing the sale.
      const response = buildProvisionalResponse(id, payload);
      deps.db.saveSaleHistory(id, "Queued", payload, response);
      return { success: true, response, error: null, queued: true };
    }
  }

  async function openingEntryForQueuedPayload(payload: Record<string, unknown>, cache: Map<string, string>): Promise<{ openingEntry: string | null; error: string | null }> {
    const current = textValue(payload, "opening_entry");
    const batch = textValue(payload, "local_offline_session_id") || (posSession.isOfflineBatchId(current) ? current : "");
    if (current && !posSession.isOfflineBatchId(current)) return { openingEntry: current, error: null };
    if (!batch) return { openingEntry: null, error: "Queued sale is missing local_offline_session_id and real POS Opening Entry." };
    const cashierUser = textValue(payload, "cashier_user");
    if (!cashierUser) return { openingEntry: null, error: "Queued sale is missing cashier_user." };
    const cacheKey = `${batch}|${cashierUser}`;
    if (cache.has(cacheKey)) return { openingEntry: cache.get(cacheKey) || null, error: null };
    const result = await posSession.startPosSession({ opening_balances: [], cashier_user: cashierUser, local_offline_session_id: batch });
    if (!result.success || !result.session) return { openingEntry: null, error: result.error || "Unable to create POS Opening Entry for offline batch." };
    const openingEntry = textValue(result.session, "opening_entry") || textValue(result.session, "name");
    if (!openingEntry) return { openingEntry: null, error: "Server returned no POS Opening Entry for offline batch." };
    cache.set(cacheKey, openingEntry);
    return { openingEntry, error: null };
  }

  // Replay queued offline sales to the server in order. Idempotent via terminal_invoice_id (server dedups).
  async function syncSaleQueue(): Promise<{ synced: number; failed: number; remaining: number; error: string | null }> {
    const settings = deps.db.loadSettings();
    const counts0 = deps.db.getQueueCounts();
    if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret) return { synced: 0, failed: 0, remaining: counts0.queued, error: "ERPNext URL and API credentials are required." };
    const auth = await http.testApiAuthentication();
    if (!auth.success) return { synced: 0, failed: 0, remaining: counts0.queued, error: "Terminal API credentials could not be revalidated." };
    let base: string;
    try { base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, ""); } catch { return { synced: 0, failed: 0, remaining: counts0.queued, error: "Invalid ERPNext URL." }; }
    let synced = 0; let failed = 0; let error: string | null = null;
    const openingCache = new Map<string, string>();
    for (const sale of deps.db.getQueuedSales()) {
      const payload = { ...sale.payload };
      try {
        const opening = await openingEntryForQueuedPayload(payload, openingCache);
        if (opening.error || !opening.openingEntry) { failed += 1; error = opening.error || "Unable to prepare POS Opening Entry for queued sale."; break; }
        if (posSession.isOfflineBatchId(opening.openingEntry)) { failed += 1; error = "Offline batch ID could not be converted to a real POS Opening Entry."; break; }
        payload.opening_entry = opening.openingEntry;
        const response = await deps.fetch(`${base}/api/method/aimatic.offline_pos.api.submit_online_sale`, { method: "POST", headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const rawBody = await response.text();
        let parsed: { message?: unknown; data?: unknown } = {};
        try { parsed = JSON.parse(rawBody) as { message?: unknown; data?: unknown }; } catch { /* non-JSON */ }
        const result = asRecord(parsed.message) ?? asRecord(parsed.data) ?? {};
        if (!response.ok) {
          failed += 1;
          error = formatResponseError(response.status, response.statusText, rawBody);
          if (isCashierPermissionSyncError(error)) {
            deps.db.setSaleHistoryStatus(sale.terminalInvoiceId, "Needs Supervisor Review");
            error = `${error}. Queued sale marked Needs Supervisor Review.`;
          }
          break;
        }
        deps.db.saveSaleHistory(sale.terminalInvoiceId, "Submitted", payload, result); synced += 1;
      } catch (e) { error = e instanceof Error ? e.message : "Still offline."; break; }
    }
    return { synced, failed, remaining: deps.db.getQueueCounts().queued, error };
  }

  async function findPosInvoicePrintFormat(base: string, apiKey: string, apiSecret: string): Promise<string> {
    try {
      const query = new URLSearchParams({ filters: JSON.stringify([["doc_type", "=", "POS Invoice"], ["disabled", "=", 0]]), fields: JSON.stringify(["name", "standard"]), limit_page_length: "50" });
      const response = await deps.fetch(`${base}/api/resource/Print%20Format?${query.toString()}`, { headers: { Authorization: `token ${apiKey}:${apiSecret}` } });
      if (!response.ok) return "";
      const body = await response.json() as { data?: unknown };
      const rows = Array.isArray(body.data) ? body.data.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
      const custom = rows.find((row) => textValue(row, "standard") === "No"); // prefer a customised thermal format over the standard one
      return textValue(custom ?? rows[0] ?? null, "name");
    } catch {
      return "";
    }
  }

  async function getPosReceipt(posInvoice: string): Promise<{ html: string | null; error: string | null }> {
    const s = deps.db.loadSettings();
    if (!posInvoice.trim()) return { html: null, error: "Missing POS Invoice name." };
    const cached = deps.db.getCachedReceiptHtml(posInvoice);
    if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return cached ? { html: cached, error: null } : { html: null, error: "Online connection required to load receipt." };
    try {
      const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
      const printFormat = await findPosInvoicePrintFormat(base, s.apiKey, s.apiSecret);
      const params = new URLSearchParams({ doctype: "POS Invoice", name: posInvoice, no_letterhead: "1", trigger_print: "0", _lang: "en" });
      if (printFormat) params.set("format", printFormat);
      const response = await deps.fetch(`${base}/printview?${params.toString()}`, { headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}` } });
      if (!response.ok) return { html: null, error: await getResponseError(response) };
      const html = await response.text();
      if (!html || !html.trim()) return { html: null, error: "Receipt HTML was not returned." };
      // The /printview page carries Frappe's print toolbar (Get PDF / Print / Menu / Letterhead) and page chrome — hide it so only the receipt shows.
      const hideChrome = thermalReceiptCss();
      const clean = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${hideChrome}</head>`) : hideChrome + html;
      deps.db.cacheReceiptHtml(posInvoice, clean);
      return { html: clean, error: null };
    } catch (e) {
      if (cached) return { html: cached, error: null };
      return { html: null, error: e instanceof Error ? e.message : "Unable to load receipt." };
    }
  }

  // Duplicate receipt: same authoritative receipt HTML with a DUPLICATE COPY banner. Never re-submits anything.
  async function getDuplicateReceipt(posInvoice: string): Promise<{ html: string | null; error: string | null }> {
    const base = await getPosReceipt(posInvoice);
    if (!base.html) return base;
    const banner = `<div class="duplicate-copy">DUPLICATE COPY<br>Invoice ${posInvoice}<br>Reprinted ${new Date().toLocaleString()}</div>`;
    let html = base.html;
    if (/<div\b[^>]*class=["'][^"']*\bpos-receipt\b[^"']*["'][^>]*>/i.test(html)) {
      html = html.replace(/(<div\b[^>]*class=["'][^"']*\bpos-receipt\b[^"']*["'][^>]*>)/i, `$1${banner}`);
    } else if (/<div\b[^>]*class=["'][^"']*\bprint-format\b[^"']*["'][^>]*>/i.test(html)) {
      html = html.replace(/(<div\b[^>]*class=["'][^"']*\bprint-format\b[^"']*["'][^>]*>)/i, `$1${banner}`);
    } else {
      html = /<body[^>]*>/i.test(html) ? html.replace(/(<body[^>]*>)/i, `$1<div class="pos-receipt">${banner}`) : `<div class="pos-receipt">${banner}${html}</div>`;
      if (/<body[^>]*>/i.test(html)) html = html.replace(/<\/body>/i, "</div></body>");
    }
    return { html, error: null };
  }

  // Online refund: read original invoice + refundable quantities from the server (authoritative).
  async function getInvoiceForRefund(invoiceName: string): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
    const s = deps.db.loadSettings();
    if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return { data: null, error: "Online connection required to load the invoice." };
    try {
      const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
      const response = await deps.fetch(`${base}/api/method/aimatic.offline_pos.api.get_pos_invoice_for_refund?invoice_name=${encodeURIComponent(invoiceName)}`, {
        headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}` }
      });
      if (!response.ok) return { data: null, error: await getResponseError(response) };
      const body = await response.json() as { message?: unknown };
      const data = asRecord(body.message);
      return data ? { data, error: null } : { data: null, error: "Invoice data was not returned." };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : "Unable to load invoice." };
    }
  }

  // Online refund submission. Electron never calls FBR — the server return hook handles FBR once.
  async function submitPosRefund(input: Record<string, unknown>): Promise<{ result: Record<string, unknown> | null; error: string | null }> {
    const s = deps.db.loadSettings();
    if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return { result: null, error: "Online connection required to submit a refund." };
    try {
      const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
      const response = await deps.fetch(`${base}/api/method/aimatic.offline_pos.api.submit_pos_refund`, {
        method: "POST",
        headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      const rawBody = await response.text();
      let parsed: { message?: unknown } = {};
      try { parsed = JSON.parse(rawBody) as { message?: unknown }; } catch { /* non-JSON */ }
      const result = asRecord(parsed.message);
      if (!response.ok) return { result: result ?? null, error: formatResponseError(response.status, response.statusText, rawBody) };
      if (result && result.success === true) {
        // Record the refund locally so the shift summary can report a Refunds total (refunds aren't in pos_sales_history).
        const invoice = asRecord(result.invoice) ?? {};
        const returnInvoice = textValue(invoice, "name") || textValue(result, "name");
        const amount = Math.abs(posSession.numValue(invoice, "grand_total") || posSession.numValue(invoice, "rounded_total") || posSession.numValue(result, "grand_total") || posSession.numValue(result, "refund_total") || 0);
        const openingEntry = textValue(input, "pos_opening_entry") || posSession.getCartIdentity().openingEntry;
        const resultPayments = Array.isArray(result.payments) ? result.payments : [];
        const inputPayments = Array.isArray(input.payments) ? input.payments : [];
        const paymentMode = textValue(asRecord(resultPayments[0]), "mode_of_payment") || textValue(asRecord(inputPayments[0]), "mode_of_payment");
        deps.db.logRefund(returnInvoice, openingEntry, amount, paymentMode);
      }
      return result ? { result, error: null } : { result: null, error: "Refund response was empty." };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : "Refund submission failed." };
    }
  }

  return {
    buildSalePayload, queueSale, submitOnlineSale, syncSaleQueue, getPosReceipt, getDuplicateReceipt,
    getInvoiceForRefund, submitPosRefund, toHeldInput, toHistoryFilter
  };
}
