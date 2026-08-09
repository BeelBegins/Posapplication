// Standalone renderer for the (optional, dual-monitor) customer-facing display
// window. Deliberately does not declare/merge its own `window.posAPI` global
// type — renderer.ts already owns that declaration for the main window, and
// this script only needs the one push-listener method, so it reads it off
// `window` directly rather than risking an incompatible global interface
// merge between the two script files.

interface CustomerDisplayLine {
  itemName: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface CustomerDisplayPayload {
  lines: CustomerDisplayLine[];
  itemCount: number;
  grandTotal: number;
  totalSavings: number;
  customerName: string;
  companyName: string;
  /** Cashier cart selection (scan / click / arrow keys). Falls back to last row. */
  highlightedIndex?: number;
}

// Persisted across renders (and across the idle <-> active toggle) since the
// company only needs to be picked up once config loads, not re-sent on every
// keystroke — an empty payload.companyName mid-sale shouldn't blank out a
// name we already know.
let lastCompanyName = "";

function money(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

// A rotating-feeling but simple pair of pleasant messages: leads with the
// savings figure when there is one (MRP vs. actual selling price), since
// that's the more concretely reassuring thing to tell a waiting customer;
// falls back to a plain thank-you otherwise so the banner is never blank.
function friendlyMessage(totalSavings: number): string {
  if (totalSavings > 0.009) return `You're saving Rs. ${money(totalSavings)} today!`;
  return "Thank you for shopping with us!";
}

function renderCustomerDisplay(payload: CustomerDisplayPayload): void {
  if (payload.companyName) lastCompanyName = payload.companyName;
  const idleCompanyEl = document.querySelector<HTMLElement>("#cd-idle-company");
  if (idleCompanyEl) idleCompanyEl.textContent = lastCompanyName;

  const idle = document.querySelector<HTMLElement>("#cd-idle");
  const active = document.querySelector<HTMLElement>("#cd-active");
  const hasItems = payload.itemCount > 0;
  if (idle) idle.hidden = hasItems;
  if (active) active.hidden = !hasItems;
  if (!hasItems) return;

  const companyEl = document.querySelector<HTMLElement>("#cd-company");
  if (companyEl) companyEl.textContent = lastCompanyName;
  const customerEl = document.querySelector<HTMLElement>("#cd-customer");
  if (customerEl) customerEl.textContent = payload.customerName || "";

  const linesEl = document.querySelector<HTMLElement>("#cd-lines");
  if (linesEl) {
    const last = payload.lines.length - 1;
    const highlight =
      typeof payload.highlightedIndex === "number" &&
      payload.highlightedIndex >= 0 &&
      payload.highlightedIndex <= last
        ? payload.highlightedIndex
        : last;
    linesEl.replaceChildren(
      ...payload.lines.map((line, index) => {
        const row = document.createElement("div");
        row.className = index === highlight ? "cd-line cd-line-latest" : "cd-line";
        const name = document.createElement("span");
        name.className = "cd-line-name";
        name.textContent = line.itemName;
        const qty = document.createElement("span");
        qty.className = "cd-line-qty";
        qty.textContent = `${line.quantity} × ${money(line.rate)}`;
        const amount = document.createElement("span");
        amount.className = "cd-line-amount";
        amount.textContent = money(line.amount);
        row.append(name, qty, amount);
        return row;
      })
    );
    // Follow cashier selection (scan / qty change / arrow keys), not always the last row.
    const highlightedRow = linesEl.children[highlight] as HTMLElement | undefined;
    if (highlightedRow) {
      // Restart blink when the same index is re-pushed (e.g. qty++ on selected row).
      highlightedRow.classList.remove("cd-line-latest");
      void highlightedRow.offsetWidth;
      highlightedRow.classList.add("cd-line-latest");
      highlightedRow.scrollIntoView({ block: "nearest" });
    }
  }

  const messageEl = document.querySelector<HTMLElement>("#cd-message");
  if (messageEl) messageEl.textContent = friendlyMessage(payload.totalSavings);

  const countEl = document.querySelector<HTMLElement>("#cd-item-count");
  if (countEl) countEl.textContent = String(payload.itemCount);
  const totalEl = document.querySelector<HTMLElement>("#cd-total");
  if (totalEl) totalEl.textContent = money(payload.grandTotal);
}

type CustomerDisplayBridge = {
  onCustomerDisplayUpdate: (callback: (payload: CustomerDisplayPayload) => void) => void;
  onCustomerDisplayTheme: (callback: (theme: string) => void) => void;
};

const bridge = (window as unknown as { posAPI: CustomerDisplayBridge }).posAPI;
bridge.onCustomerDisplayTheme((theme) => {
  document.documentElement.dataset.theme = theme || "warm-market";
});
bridge.onCustomerDisplayUpdate((payload) => renderCustomerDisplay(payload));
