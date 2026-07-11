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
  customerName: string;
}

function money(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function renderCustomerDisplay(payload: CustomerDisplayPayload): void {
  const idle = document.querySelector<HTMLElement>("#cd-idle");
  const active = document.querySelector<HTMLElement>("#cd-active");
  const hasItems = payload.itemCount > 0;
  if (idle) idle.hidden = hasItems;
  if (active) active.hidden = !hasItems;
  if (!hasItems) return;

  const customerEl = document.querySelector<HTMLElement>("#cd-customer");
  if (customerEl) customerEl.textContent = payload.customerName || "";

  const linesEl = document.querySelector<HTMLElement>("#cd-lines");
  if (linesEl) {
    linesEl.replaceChildren(
      ...payload.lines.map((line) => {
        const row = document.createElement("div");
        row.className = "cd-line";
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
  }

  const countEl = document.querySelector<HTMLElement>("#cd-item-count");
  if (countEl) countEl.textContent = String(payload.itemCount);
  const totalEl = document.querySelector<HTMLElement>("#cd-total");
  if (totalEl) totalEl.textContent = money(payload.grandTotal);
}

type CustomerDisplayBridge = {
  onCustomerDisplayUpdate: (callback: (payload: CustomerDisplayPayload) => void) => void;
};

(window as unknown as { posAPI: CustomerDisplayBridge }).posAPI.onCustomerDisplayUpdate((payload) =>
  renderCustomerDisplay(payload)
);
