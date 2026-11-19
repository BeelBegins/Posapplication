# Aimatic HR app — design system (v2)

Reference: Frappe HR PWA (`apps/hrms/frontend`, Ionic + frappe-ui) and Horilla mobile. Goal: calm, clean, card-and-list UI; content first, no heavy gradients.

## Tokens (styles.css `:root`, v2 layer at the end of the file)
- **Spacing (4-pt base):** 4, 8, 12, 16, 24, 32 (`--space-1..6`). Page padding 16; section gap 24; within a card 12.
- **Radii:** 8 (calendar cells, small), 12 (inputs, buttons, tiles), 16 (cards, grouped lists), 24 (setup card).
- **Elevation:** `--elev-1` hairline (cards, lists); `--elev-2` only for toasts/sheets.
- **Type:** 26/700 home greeting; 20/700 page title; 17/700 card title; 15/600 list primary; 15/400 body; 13/400 meta; 11/700 uppercase label.
- **Colour:** brand teal `--brand-500/600/700` + `--brand-50` tint; neutrals `--neutral-*`; semantic success/warn/danger/info (50 = tint background, 600/700 = text). Light and dark both defined; `html[data-theme]` overrides the OS setting.
- **Attendance statuses:** present green, absent red, half day amber, leave blue, holiday purple, weekly off grey, upcoming outline.

## Components
- **Page header** (`pageHeader`): sticky, translucent background. Home = avatar + greeting + first name + refresh. Other tabs = title. Sub-screens (calendar, enrollment) = back arrow + title.
- **Section title** (`sectionTitle`): 15/700 with an optional right link ("See all", "Apply").
- **Cards:** `.card` (16 radius, hairline border); `.today-card` (status + primary CTA); `.pay-hero` (brand gradient, one per screen max); `.profile-card` (centred avatar).
- **Grouped list:** `.list` is one rounded container; `.list-row` rows split by dividers with leading `.row-icon` (36px, tinted) and trailing `.row-trail` (time/amount, tabular numbers). `.nav-row` = standalone tappable row with chevron.
- **Stat tiles:** `.tiles` auto-fit grid of `.tile` (big number + label) for leave balance and open requests.
- **Quick actions:** `.qa-row` 4-column icon tiles (3 on ≤380px).
- **Buttons:** 46px min height; primary = solid teal; secondary = bordered surface; text; danger-text for destructive non-primary actions (Sign out).
- **Chips/status:** `statusBadge(label, statusTone(status))`: Approved/Paid green, Rejected/Cancelled red, Open/Pending/Draft amber, else info.
- **Empty states:** circular tinted icon, 15/600 title, 13 meta. Every list has one.
- **Loading:** skeleton rows (`loadingSkeleton`).
- **Bottom nav:** 5 tabs, active tab gets a pill behind the icon.
- **Dates:** always human (`formatDay` "Tue 17 Nov", `formatDateTime` "Tue 17 Nov · 09:02", `formatDateRange` "20–22 Nov"), ERP wall-clock, no timezone shifting.

## Accessibility
44–48px touch targets, visible focus ring (`:focus-visible`), AA contrast in both themes, `aria-label` on icon-only buttons, reduced-motion respected.
