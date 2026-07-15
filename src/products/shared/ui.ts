export type UiTone = "neutral" | "success" | "warning" | "danger" | "info";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[character]!
  ));
}

export function formatMoney(value: unknown, currency = "PKR"): string {
  return `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
}

export function statusBadge(label: string, tone: UiTone = "neutral"): string {
  return `<span class="ui-status ${tone}">${escapeHtml(label)}</span>`;
}

export function emptyState(icon: string, title: string, detail: string, action?: { label:string; attribute:string }): string {
  return `<div class="ui-empty"><span aria-hidden="true">${escapeHtml(icon)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p>${action?`<button class="primary" ${action.attribute}>${escapeHtml(action.label)}</button>`:""}</div>`;
}

export function loadingSkeleton(rows = 3): string {
  return `<div class="ui-skeleton" aria-label="Loading" aria-busy="true">${Array.from({length:rows},()=>'<span></span>').join("")}</div>`;
}

export function bottomNavigation<T extends string>(label: string, active: T, items: Array<{ id:T; label:string; icon:string; badge?:number }>): string {
  return `<nav class="app-nav" aria-label="${escapeHtml(label)}">${items.map((item)=>`<button data-screen="${escapeHtml(item.id)}" ${item.id===active?'aria-current="page"':""} aria-label="${escapeHtml(item.label)}"><span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${escapeHtml(item.label)}</span>${item.badge?`<b>${item.badge}</b>`:""}</button>`).join("")}</nav>`;
}
