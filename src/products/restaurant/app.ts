import {
  addMenuItem,
  applyKitchenTicket,
  changeUnsentQuantity,
  createKitchenTicket,
  lineAmount,
  nextKitchenStatus,
  orderTotal,
  pendingKitchenLines,
  requestBill,
  statusForOrder,
  type MenuItem,
  type RestaurantModifier,
  type RestaurantOrder,
  type RestaurantTable,
  type TableStatus,
} from "./domain";
import {
  floors as seedFloors,
  menu as seedMenu,
  orders as seedOrders,
  tables as seedTables,
} from "./mock-data";
import { createApiClient } from "../../api/client";
import { createRestaurantApi } from "../../api/restaurant";
import { capacitorOAuthBrowser } from "../../mobile/capacitor-oauth-browser";
import {
  OAuthPkceCredentialProvider,
  type OAuthPublicClientConfig,
} from "../../mobile/credential-provider";
import { androidSecureStorage } from "../../mobile/secure-storage";

declare const __APP_VERSION__: string;
type Screen =
  "home" | "tables" | "orders" | "menu" | "activity" | "profile" | "order";
type ViewMode = "map" | "list";
interface Activity {
  id: string;
  at: string;
  icon: string;
  title: string;
  detail: string;
  tone?: string;
}
interface State {
  waiter: string;
  branch: string;
  shiftStarted: string;
  tables: RestaurantTable[];
  orders: RestaurantOrder[];
  activities: Activity[];
  offlineQueue: string[];
}
type Row = Record<string, unknown>;

const root = document.querySelector<HTMLElement>("#app")!;
const storageKey = "aimatic-restaurant-prototype-v2";
const configKey = "aimatic-restaurant-config-v1";
const fetcher = globalThis.fetch.bind(globalThis);
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ]!,
  );
const money = (value: number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value);
const ago = (date?: string) => {
  if (!date) return "—";
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000));
  return min < 1
    ? "Just now"
    : min < 60
      ? `${min}m`
      : min < 1440
        ? `${Math.floor(min / 60)}h ${min % 60}m`
        : `${Math.floor(min / 1440)}d`;
};
const cloneSeed = (): State => ({
  waiter: "Ayesha Khan",
  branch: "Main Branch",
  shiftStarted: new Date(Date.now() - 3.4 * 3600000).toISOString(),
  tables: structuredClone(seedTables).map((table) => ({
    ...table,
    amount: (table.amount || 0) * 100,
  })),
  orders: structuredClone(seedOrders),
  offlineQueue: ["Guest note · Table 7"],
  activities: [
    {
      id: "a1",
      at: new Date(Date.now() - 2 * 60000).toISOString(),
      icon: "▣",
      title: "Bill requested",
      detail: "Table 4 · REST-1004",
      tone: "blue",
    },
    {
      id: "a2",
      at: new Date(Date.now() - 5 * 60000).toISOString(),
      icon: "✓",
      title: "Kitchen marked ready",
      detail: "4 × Mint Lemonade · Table 3",
      tone: "green",
    },
    {
      id: "a3",
      at: new Date(Date.now() - 12 * 60000).toISOString(),
      icon: "↗",
      title: "Items sent to kitchen",
      detail: "2 items · Table 6",
      tone: "orange",
    },
    {
      id: "a4",
      at: new Date(Date.now() - 18 * 60000).toISOString(),
      icon: "!",
      title: "Preparation delayed",
      detail: "Copper House Burger · Table 6",
      tone: "red",
    },
    {
      id: "a5",
      at: new Date(Date.now() - 42 * 60000).toISOString(),
      icon: "＋",
      title: "Table opened",
      detail: "Table 1 · 3 guests",
      tone: "green",
    },
  ],
});
function load(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "");
    return parsed?.waiter ? parsed : cloneSeed();
  } catch {
    return cloneSeed();
  }
}
let floors = structuredClone(seedFloors),
  menu = structuredClone(seedMenu),
  floorIds = new Map(seedFloors.map((name) => [name, name]));
let state = load(),
  screen: Screen = "home",
  previousScreen: Screen = "tables",
  floor = floors[0],
  viewMode: ViewMode = "map",
  tableSearch = "",
  category = "Popular",
  menuSearch = "",
  activeOrderName = "",
  orderTab: "menu" | "cart" | "progress" | "bill" = "menu",
  orderFilter = "My tables",
  notice = "",
  modal = "";
let networkOnline = navigator.onLine,
  lastSync = new Date().toISOString();
let mode: "demo" | "live" = "demo",
  config: OAuthPublicClientConfig | null = null,
  credentials: OAuthPkceCredentialProvider | null = null,
  api: ReturnType<typeof createRestaurantApi> | null = null,
  restaurantProfile = "",
  busy = false;
const activeOrder = () => state.orders.find((x) => x.name === activeOrderName);
const activeTable = () =>
  state.tables.find((x) => x.orderName === activeOrderName);
const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
const uuid = () => globalThis.crypto?.randomUUID?.() || `req-${Date.now()}`;
const text = (row: Row | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] != null) return String(row[key]);
  return "";
};
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Row => Boolean(entry) && typeof entry === "object",
      )
    : [];
async function payload(response: Response) {
  const raw = (await response.json().catch(() => ({}))) as Row;
  const value = (
    raw.message && typeof raw.message === "object" ? raw.message : raw
  ) as Row;
  if (!response.ok)
    throw new Error(
      text(value, "message", "exception") || `Server error ${response.status}`,
    );
  return value;
}
function mapOrder(value: Row): RestaurantOrder {
  return {
    name: text(value, "name"),
    branch: text(value, "branch"),
    floor: text(value, "floor"),
    table: text(value, "table"),
    waiter: text(value, "waiter"),
    guestCount: Number(value.guest_count || 1),
    status: (text(value, "status") || "Open") as RestaurantOrder["status"],
    posInvoice: text(value, "pos_invoice") || null,
    modified: text(value, "modified"),
    openedAt: text(value, "opened_at"),
    netTotal: Number(value.net_total || 0),
    taxes: Number(value.taxes || 0),
    grandTotal: Number(value.grand_total || 0),
    lines: rows(value.items).map((line) => ({
      id: text(line, "id"),
      itemCode: text(line, "item_code"),
      itemName: text(line, "item_name"),
      uom: text(line, "uom") || "Nos",
      quantity: Number(line.quantity || 0),
      sentQuantity: Number(line.sent_quantity || 0),
      rate: Number(line.rate || 0),
      notes: text(line, "notes"),
      modifiers: rows(line.modifiers).map((modifier) => ({
        code: text(modifier, "code"),
        label: text(modifier, "label"),
        price: Number(modifier.price || 0),
      })),
      kitchenStatus: (text(line, "kitchen_status").replace(
        "Not Sent",
        "Not sent",
      ) || "Not sent") as RestaurantOrder["lines"][number]["kitchenStatus"],
      station: text(line, "kitchen_station"),
      addedAt: text(line, "added_at"),
    })),
  };
}
function replaceOrder(value: Row) {
  const order = mapOrder(value);
  state.orders = [
    ...state.orders.filter((entry) => entry.name !== order.name),
    order,
  ];
  const table = state.tables.find((entry) => entry.id === order.table);
  if (table)
    Object.assign(table, {
      orderName: order.name,
      guests: order.guestCount,
      waiter: order.waiter,
      openedAt: order.openedAt,
      amount: orderTotal(order),
      status: statusForOrder(order),
    });
  activeOrderName = order.name;
  save();
  return order;
}
function log(title: string, detail: string, icon = "•", tone = "") {
  state.activities.unshift({
    id: uuid(),
    at: new Date().toISOString(),
    title,
    detail,
    icon,
    tone,
  });
  state.activities = state.activities.slice(0, 50);
}
function flash(text: string) {
  notice = text;
  render();
  setTimeout(() => {
    if (notice === text) {
      notice = "";
      render();
    }
  }, 2600);
}
async function configure(baseUrl: string) {
  const url = baseUrl.replace(/\/+$/, "");
  const pub = await payload(
    await fetcher(
      `${url}/api/method/aimatic.restaurant.api.get_public_config`,
      { method: "POST" },
    ),
  );
  config = {
    baseUrl: url,
    clientId: text(pub, "oauth_client_id"),
    redirectUri: text(pub, "redirect_uri"),
    scope: text(pub, "scope"),
  };
  if (!config.clientId || !config.redirectUri)
    throw new Error("Restaurant OAuth is not configured.");
  localStorage.setItem(configKey, JSON.stringify(config));
  credentials = new OAuthPkceCredentialProvider(
    async () => config!,
    androidSecureStorage,
    capacitorOAuthBrowser,
    fetcher,
  );
  api = createRestaurantApi(
    createApiClient({
      baseUrl: url,
      authentication: { mode: "user-session", credentials },
      fetch: fetcher,
    }),
  );
}
function setup(error = "") {
  root.innerHTML = `<section class="restaurant-setup"><div class="setup-card"><div class="brand-mark">AM</div><p class="eyebrow">Restaurant waiter</p><h1>Fast service starts here</h1><p>Connect securely to ERPNext, or explore the interface with isolated demo data.</p>${error ? `<p class="setup-error">${esc(error)}</p>` : ""}<form id="restaurant-setup"><label>ERPNext URL<input id="restaurant-url" type="url" required placeholder="https://erp.example.com" autocomplete="url"></label><button class="primary wide">Connect to ERPNext</button></form><button id="restaurant-demo" class="secondary wide">Explore demo</button><small>v${esc(__APP_VERSION__)} · OAuth PKCE · No API key or secret</small></div></section>`;
  document.querySelector<HTMLFormElement>("#restaurant-setup")!.onsubmit =
    async (event) => {
      event.preventDefault();
      try {
        busy = true;
        await configure(
          document.querySelector<HTMLInputElement>("#restaurant-url")!.value,
        );
        signIn();
      } catch (reason) {
        busy = false;
        setup(reason instanceof Error ? reason.message : "Connection failed");
      }
    };
  document.querySelector<HTMLButtonElement>("#restaurant-demo")!.onclick =
    () => {
      mode = "demo";
      state = cloneSeed();
      floors = structuredClone(seedFloors);
      menu = structuredClone(seedMenu);
      save();
      render();
    };
}
function signIn(error = "") {
  root.innerHTML = `<section class="restaurant-setup"><div class="setup-card"><div class="brand-mark">AM</div><p class="eyebrow">Secure waiter access</p><h1>Sign in to your shift</h1><p>Your ERPNext roles, branch, POS Profile, menu pricing and stock remain authoritative.</p>${error ? `<p class="setup-error">${esc(error)}</p>` : ""}<button id="restaurant-login" class="primary wide">Sign in with ERPNext</button><button id="restaurant-change-server" class="secondary wide">Change server</button></div></section>`;
  document.querySelector<HTMLButtonElement>("#restaurant-login")!.onclick =
    async () => {
      try {
        await credentials!.login();
        await loadWorkspace();
      } catch (reason) {
        signIn(reason instanceof Error ? reason.message : "Sign in failed");
      }
    };
  document.querySelector<HTMLButtonElement>(
    "#restaurant-change-server",
  )!.onclick = () => void changeServer();
}
async function loadWorkspace() {
  if (!api) return;
  busy = true;
  root.innerHTML = `<section class="restaurant-setup"><div class="setup-card"><div class="brand-mark">AM</div><h1>Preparing your floor</h1><p>Loading permitted tables, current orders, ERPNext prices and stock…</p></div></section>`;
  try {
    let data = await payload(await api.getBootstrap());
    if (data.requires_profile_selection) {
      const profiles = rows(data.profiles);
      if (!profiles.length)
        throw new Error("No permitted Restaurant Profile is available.");
      restaurantProfile = text(profiles[0], "name");
      data = await payload(
        await api.getBootstrap(undefined, restaurantProfile),
      );
    } else restaurantProfile = text(data.profile as Row, "profile");
    const profile = data.profile as Row;
    const serverFloors = rows(data.floors);
    floors = serverFloors.map((entry) => text(entry, "title", "name"));
    floorIds = new Map(
      serverFloors.map((entry) => [text(entry, "title", "name"), text(entry, "name")]),
    );
    floor = floors[0] || "Floor";
    menu = rows(data.items).map((item) => ({
      code: text(item, "item_code"),
      name: text(item, "item_name"),
      description: text(item, "description"),
      category: text(item, "category") || "Menu",
      price: Number(item.rate || 0),
      available: Boolean(item.available),
      prepMinutes: Number(item.preparation_minutes || 10),
      vegetarian: Boolean(item.vegetarian),
      spicy: Boolean(item.spicy),
      popular: Boolean(item.popular),
      station: text(item, "kitchen_station") || "Kitchen",
      modifiers: rows(item.modifier_groups).map((group) => ({
        title: text(group, "title"),
        required: Boolean(group.required),
        multiple: Boolean(group.multiple),
        options: rows(group.options).map((option) => ({
          code: text(option, "code"),
          label: text(option, "label"),
          price: Number(option.price || 0),
        })),
      })),
    }));
    const orderData = await payload(
      await api.getOrders({
        branch: text(profile, "branch"),
        restaurantProfile,
      }),
    );
    const liveOrders = rows(orderData.orders).map(mapOrder);
    state = {
      waiter: text(data, "full_name", "user"),
      branch: text(profile, "branch"),
      shiftStarted: new Date().toISOString(),
      orders: liveOrders,
      tables: rows(data.tables).map((table) => ({
        id: text(table, "name"),
        title: text(table, "title"),
        floor:
          text(
            serverFloors.find(
              (entry) => text(entry, "name") === text(table, "floor"),
            ),
            "title",
          ) || text(table, "floor"),
        capacity: Number(table.capacity || 1),
        status: (text(table, "status") || "Available") as TableStatus,
        guests: Number(table.guests || 0),
        waiter: text(table, "waiter"),
        orderName: text(table, "order") || undefined,
        amount: Number(table.amount || 0),
        openedAt: text(table, "opened_at") || undefined,
      })),
      activities: [],
      offlineQueue: [],
    };
    mode = "live";
    lastSync = text(data, "server_time") || new Date().toISOString();
    save();
    screen = "home";
    render();
  } catch (reason) {
    if (reason instanceof Error && /401|sign.in|auth/i.test(reason.message))
      signIn(reason.message);
    else
      setup(
        reason instanceof Error
          ? reason.message
          : "Unable to load Restaurant workspace",
      );
  } finally {
    busy = false;
  }
}
async function startRestaurant() {
  const raw = localStorage.getItem(configKey);
  if (!raw) return setup();
  try {
    await configure((JSON.parse(raw) as OAuthPublicClientConfig).baseUrl);
    if (!(await credentials!.getAccessToken())) return signIn();
    await loadWorkspace();
  } catch (reason) {
    setup(
      reason instanceof Error ? reason.message : "Unable to start Restaurant",
    );
  }
}
async function changeServer() {
  await credentials?.clear();
  localStorage.removeItem(configKey);
  config = null;
  credentials = null;
  api = null;
  mode = "demo";
  setup();
}
const statusMeta: Record<TableStatus, [string, string]> = {
  Available: ["✓", "Available"],
  Occupied: ["●", "Occupied"],
  "Order pending": ["…", "Order pending"],
  "Sent to kitchen": ["↗", "Sent to kitchen"],
  "Partially served": ["◐", "Partially served"],
  "Bill requested": ["▣", "Bill requested"],
  "Payment pending": ["⌁", "Payment pending"],
  "Needs attention": ["!", "Needs attention"],
};

function shell(
  content: string,
  opts: { title?: string; back?: boolean; nav?: boolean } = {},
) {
  const title =
    opts.title ||
    {
      home: "Shift overview",
      tables: "Tables",
      orders: "Orders",
      menu: "Menu",
      activity: "Activity",
      profile: "Profile",
      order: "Table order",
    }[screen];
  return `<div class="app-shell"><header class="app-header">${opts.back ? '<button class="icon-button" data-action="back" aria-label="Go back">←</button>' : '<button class="brand-mark" data-screen="home" aria-label="Shift overview">AM</button>'}<div class="header-copy"><small>${esc(state.branch)}</small><h1>${esc(title)}</h1></div><div class="connection ${networkOnline ? "online" : "offline"}" aria-label="${networkOnline ? "Online" : "Offline"}"><i></i><span>${networkOnline ? "Online" : "Offline"}</span></div></header>${notice ? `<div class="toast" role="status">${esc(notice)}</div>` : ""}<main class="content">${content}</main>${opts.nav === false ? "" : bottomNav()}${modal}</div>`;
}
function bottomNav() {
  return `<nav class="bottom-nav" aria-label="Restaurant navigation">${(
    [
      ["tables", "▦", "Tables"],
      ["orders", "▤", "Orders"],
      ["menu", "⌕", "Menu"],
      ["activity", "◴", "Activity"],
      ["profile", "○", "Profile"],
    ] as const
  )
    .map(
      ([id, icon, label]) =>
        `<button data-screen="${id}" class="${screen === id || (screen === "home" && id === "tables") ? "active" : ""}" aria-label="${label}" aria-current="${screen === id ? "page" : "false"}"><span>${icon}</span><small>${label}</small></button>`,
    )
    .join("")}</nav>`;
}
function metric(icon: string, value: string, label: string, tone = "") {
  return `<button class="metric-card ${tone}" data-screen="${label.includes("table") ? "tables" : "orders"}"><span>${icon}</span><div><strong>${esc(value)}</strong><small>${esc(label)}</small></div></button>`;
}
function renderHome() {
  const open = state.tables.filter((x) => x.status !== "Available").length,
    pending = state.orders
      .flatMap((x) => x.lines)
      .filter(
        (x) => x.kitchenStatus === "Queued" || x.kitchenStatus === "Preparing",
      ).length,
    bills = state.tables.filter(
      (x) => x.status === "Bill requested" || x.status === "Payment pending",
    ).length,
    delayed = state.tables.filter((x) => x.status === "Needs attention").length,
    guests = state.tables.reduce((n, x) => n + x.guests, 0);
  root.innerHTML = shell(
    `<section class="waiter-strip"><div class="avatar">AK</div><div><p>Good evening</p><h2>${esc(state.waiter)}</h2><small>Evening shift · ${ago(state.shiftStarted)}</small></div><button class="primary compact" data-action="new-order">＋ New order</button></section><section class="metric-grid">${metric("▦", String(open), "Open tables", "amber")}${metric("♨", String(pending), "Pending kitchen", "orange")}${metric("▣", String(bills), "Tables requesting bills", "blue")}${metric("!", String(delayed), "Delayed orders", "red")}${metric("♙", String(guests), "Total active guests", "green")}${metric("↻", state.offlineQueue.length ? String(state.offlineQueue.length) : "0", "Pending synchronization", state.offlineQueue.length ? "orange" : "green")}</section><section class="section-card"><div class="section-heading"><div><p class="eyebrow">Needs action</p><h2>Service pulse</h2></div><button data-screen="orders" class="text-button">View orders</button></div>${
      state.tables
        .filter((x) =>
          ["Needs attention", "Bill requested", "Payment pending"].includes(
            x.status,
          ),
        )
        .map(tableRow)
        .join("") ||
      empty("All caught up", "No tables currently need attention.")
    }</section><footer class="sync-line"><span>Last sync ${ago(lastSync)}</span><button data-action="sync">↻ Sync now</button></footer>`,
    { title: "Shift overview" },
  );
}

function tableRow(t: RestaurantTable) {
  const [icon, label] = statusMeta[t.status];
  return `<button class="table-row" data-table="${esc(t.id)}"><span class="status-symbol status-${slug(t.status)}">${icon}</span><div><strong>${esc(t.title)}</strong><small>${t.guests ? `${t.guests} guests · ${ago(t.openedAt)}` : `Seats ${t.capacity}`}</small></div><span class="status-label">${label}</span><b>${t.amount ? money(t.amount) : ""}</b></button>`;
}
const slug = (s: string) => s.toLowerCase().replaceAll(" ", "-");
function renderTables() {
  const filtered = state.tables.filter(
    (t) =>
      t.floor === floor &&
      (!tableSearch ||
        `${t.title} ${t.status} ${t.waiter}`
          .toLowerCase()
          .includes(tableSearch.toLowerCase())),
  );
  root.innerHTML = shell(
    `<section class="toolbar sticky-tools"><div class="segmented">${floors.map((x) => `<button data-floor="${esc(x)}" class="${floor === x ? "active" : ""}">${esc(x)}</button>`).join("")}</div><div class="tool-row"><label class="search"><span>⌕</span><input id="table-search" value="${esc(tableSearch)}" placeholder="Search table or status" aria-label="Search tables"></label><div class="view-toggle"><button data-view="map" class="${viewMode === "map" ? "active" : ""}" aria-label="Floor map">▦</button><button data-view="list" class="${viewMode === "list" ? "active" : ""}" aria-label="Table list">☷</button></div></div></section>${viewMode === "map" ? `<section class="floor-map" aria-label="${esc(floor)} table map">${filtered.map(tableCard).join("")}</section>` : `<section class="table-list">${filtered.map(tableRow).join("")}</section>`}${!filtered.length ? empty("No matching tables", "Try another table name, floor, or status.") : ""}<button class="fab" data-action="new-order" aria-label="Start new order">＋</button>`,
    { title: "Tables" },
  );
  setTimeout(
    () => document.querySelector<HTMLInputElement>("#table-search")?.focus(),
    tableSearch ? 0 : 999999,
  );
}
function tableCard(t: RestaurantTable) {
  const [icon, label] = statusMeta[t.status];
  return `<button class="table-card status-${slug(t.status)}" data-table="${esc(t.id)}"><div class="table-card-top"><span>${icon} ${esc(label)}</span><small>${t.guests ? `${t.guests}/${t.capacity} guests` : `${t.capacity} seats`}</small></div><strong>${esc(t.title)}</strong>${t.guests ? `<div class="table-details"><span>${esc(t.waiter.split(" ")[0])}</span><span>${ago(t.openedAt)}</span><b>${money(t.amount || 0)}</b></div>` : '<div class="available-action">Tap to start order →</div>'}</button>`;
}

function orderCard(o: RestaurantOrder) {
  const table = state.tables.find((x) => x.orderName === o.name),
    ready = o.lines.filter((x) => x.kitchenStatus === "Ready").length,
    delayed = table?.status === "Needs attention";
  return `<button class="order-card ${delayed ? "attention" : ""}" data-order="${esc(o.name)}"><div><span class="table-pill">${esc(table?.title || o.table)}</span>${delayed ? '<span class="attention-pill">! Delayed</span>' : ready ? `<span class="ready-pill">${ready} ready</span>` : ""}</div><h3>${esc(o.name)}</h3><p>${o.guestCount} guests · ${ago(o.openedAt)} · ${o.lines.reduce((n, x) => n + x.quantity, 0)} items</p><footer><span class="status-label">${esc(table?.status || o.status)}</span><strong>${money(orderTotal(o))}</strong></footer></button>`;
}
function renderOrders() {
  const all = state.orders,
    active = all.filter(
      (x) => x.status !== "Closed" && x.status !== "Cancelled",
    ),
    filtered =
      orderFilter === "Pending kitchen"
        ? active.filter((x) =>
            x.lines.some(
              (l) =>
                l.kitchenStatus === "Queued" || l.kitchenStatus === "Preparing",
            ),
          )
        : orderFilter === "Ready"
          ? active.filter((x) =>
              x.lines.some((l) => l.kitchenStatus === "Ready"),
            )
          : orderFilter === "Bill requested"
            ? active.filter((x) => x.status === "Bill Requested")
            : orderFilter === "Completed"
              ? all.filter((x) => x.status === "Closed")
              : active;
  root.innerHTML = shell(
    `<div class="filter-chips">${["My tables", "Pending kitchen", "Ready", "Bill requested", "Completed"].map((x) => `<button data-order-filter="${x}" class="${orderFilter === x ? "active" : ""}">${x}${x === "My tables" ? ` <b>${active.length}</b>` : ""}</button>`).join("")}</div><section class="order-grid">${filtered.map(orderCard).join("")}</section>${!filtered.length ? empty("No matching orders", "There are no orders in this status right now.") : ""}`,
    { title: "Active orders" },
  );
}

function menuCard(item: MenuItem, ordered = 0) {
  return `<button class="menu-card ${!item.available ? "unavailable" : ""}" data-menu-item="${esc(item.code)}" ${!item.available ? "disabled" : ""}><div class="food-image"><span>${item.category === "Drinks" ? "◒" : item.category === "Desserts" ? "◇" : "◉"}</span>${item.popular ? "<b>Popular</b>" : item.recent ? "<b>Recent</b>" : ""}</div><div class="menu-copy"><div class="item-flags">${item.vegetarian ? '<i class="veg" title="Vegetarian">V</i>' : ""}${item.spicy ? '<i class="spicy" title="Spicy">♨</i>' : ""}<small>${esc(item.prepMinutes)} min</small></div><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><footer><strong>${money(item.price)}</strong>${!item.available ? "<span>Unavailable</span>" : ordered ? `<span class="ordered">${ordered} ordered</span>` : '<span class="add">＋</span>'}</footer></div></button>`;
}
function menuItems() {
  const q = menuSearch.toLowerCase();
  return menu.filter(
    (x) =>
      (category === "All" ||
        (category === "Popular" && x.popular) ||
        x.category === category) &&
      (!q ||
        `${x.name} ${x.description} ${x.category} ${x.code}`
          .toLowerCase()
          .includes(q)),
  );
}
function menuContent(order?: RestaurantOrder) {
  const categories = [
    "Popular",
    "Starters",
    "Mains",
    "Pizza",
    "Drinks",
    "Desserts",
    "All",
  ];
  return `<section class="menu-toolbar"><label class="search prominent"><span>⌕</span><input id="menu-search" value="${esc(menuSearch)}" placeholder="Search item, category or code" aria-label="Search menu"><button data-action="scan" aria-label="Scan barcode">▣</button></label><div class="category-tabs">${categories.map((x) => `<button data-category="${x}" class="${category === x ? "active" : ""}">${x}</button>`).join("")}</div></section><section class="menu-grid">${menuItems()
    .map((item) =>
      menuCard(
        item,
        order?.lines
          .filter((x) => x.itemCode === item.code)
          .reduce((n, x) => n + x.quantity, 0) || 0,
      ),
    )
    .join(
      "",
    )}</section>${!menuItems().length ? empty("Nothing found", "Try a different item, category, or code.") : ""}`;
}
function renderMenu() {
  root.innerHTML = shell(
    `${menuContent()}<div class="menu-hint"><span>Choose a table before adding items</span><button data-screen="tables">Select table</button></div>`,
    { title: "Menu catalogue" },
  );
}

function orderHeader(o: RestaurantOrder, t?: RestaurantTable) {
  return `<section class="order-header"><button data-action="back" class="icon-button">←</button><div><small>${esc(o.floor)} · ${esc(o.name)}</small><h2>${esc(t?.title || o.table)} <span>${o.guestCount} guests</span></h2></div><div class="order-meta"><span>${ago(o.openedAt)}</span><b>${esc(t?.status || o.status)}</b></div><button class="icon-button" data-action="order-more" aria-label="More actions">•••</button></section><div class="order-quick"><button data-action="add-guest">＋ Guest</button><button data-action="table-note">✎ Note</button><button data-action="transfer">⇄ Transfer</button><button data-action="request-bill">▣ Bill</button></div>`;
}
function renderOrder() {
  const o = activeOrder(),
    t = activeTable();
  if (!o) {
    screen = "tables";
    return render();
  }
  const tabs = `<nav class="order-tabs"><button data-order-tab="menu" class="${orderTab === "menu" ? "active" : ""}">Menu</button><button data-order-tab="cart" class="${orderTab === "cart" ? "active" : ""}">Order <b>${o.lines.reduce((n, x) => n + x.quantity, 0)}</b></button><button data-order-tab="progress" class="${orderTab === "progress" ? "active" : ""}">Progress</button><button data-order-tab="bill" class="${orderTab === "bill" ? "active" : ""}">Bill</button></nav>`;
  let body =
    orderTab === "menu"
      ? menuContent(o)
      : orderTab === "cart"
        ? cartContent(o)
        : orderTab === "progress"
          ? progressContent(o)
          : billContent(o);
  root.innerHTML = shell(
    `${orderHeader(o, t)}${tabs}${body}${orderFooter(o)}`,
    { title: t?.title || o.table, back: false, nav: false },
  );
}
function groupedLines(o: RestaurantOrder) {
  const groups = [
    "Not sent",
    "Queued",
    "Preparing",
    "Ready",
    "Served",
    "Cancelled",
  ];
  return groups
    .map((status) => ({
      status,
      lines: o.lines.filter((x) => (x.kitchenStatus || "Not sent") === status),
    }))
    .filter((x) => x.lines.length);
}
function cartContent(o: RestaurantOrder) {
  return `<section class="order-lines">${
    groupedLines(o)
      .map(
        (g) =>
          `<div class="line-group"><h3><span class="status-dot status-${slug(g.status)}"></span>${g.status}<b>${g.lines.length}</b></h3>${g.lines.map((line) => `<article class="order-line"><div><strong>${esc(line.itemName)}</strong><p>${esc(line.modifiers.map((x) => x.label).join(", ") || "Standard")}</p>${line.notes ? `<small>“${esc(line.notes)}”</small>` : ""}<span>${esc(line.station || "Kitchen")} · ${ago(line.addedAt)}</span></div>${line.sentQuantity === 0 ? `<div class="qty"><button data-qty="-1" data-line="${line.id}">−</button><input data-qty-input data-line="${line.id}" value="${line.quantity}" inputmode="numeric" aria-label="Quantity"><button data-qty="1" data-line="${line.id}">＋</button></div>` : `<div class="locked">🔒 × ${line.quantity}</div>`}<strong>${money(lineAmount(line))}</strong><button class="line-menu" data-line-more="${line.id}" aria-label="Item actions">⋮</button></article>`).join("")}</div>`,
      )
      .join("") ||
    empty("Order is empty", "Add a menu item to start this order.")
  }</section>`;
}
function progressContent(o: RestaurantOrder) {
  const delayed = o.lines.filter(
    (x) =>
      x.kitchenStatus === "Preparing" &&
      Date.now() - Date.parse(x.addedAt || o.modified) > 15 * 60000,
  );
  return `<div class="filter-chips"><button class="active">All</button><button>Delayed ${delayed.length}</button><button>Ready ${o.lines.filter((x) => x.kitchenStatus === "Ready").length}</button><button>Not served</button></div><section class="progress-list">${
    o.lines
      .filter((x) => x.sentQuantity > 0)
      .map(
        (line) =>
          `<article class="progress-item ${delayed.includes(line) ? "delayed" : ""}"><div class="progress-icon">${line.kitchenStatus === "Ready" ? "✓" : line.kitchenStatus === "Served" ? "●" : "♨"}</div><div><h3>${line.quantity} × ${esc(line.itemName)}</h3><p>${esc(line.station || "Kitchen")} · ${esc(line.kitchenStatus)}</p>${delayed.includes(line) ? "<small>Delayed · check with kitchen</small>" : `<small>Updated ${ago(line.addedAt)}</small>`}</div>${line.kitchenStatus !== "Served" ? `<button data-action="advance-line" data-line="${line.id}">${line.kitchenStatus === "Ready" ? "Mark served" : "Advance"}</button>` : '<span class="served-label">Served</span>'}</article>`,
      )
      .join("") ||
    empty("Nothing sent yet", "Kitchen progress appears after sending items.")
  }</section><section class="timeline"><h3>Order timeline</h3>${[
    ["Order received", o.openedAt],
    ["Sent to kitchen", o.lines.find((x) => x.sentQuantity)?.addedAt],
    [
      "Preparing",
      o.lines.find((x) => x.kitchenStatus === "Preparing")?.addedAt,
    ],
    ["Ready", o.lines.find((x) => x.kitchenStatus === "Ready")?.addedAt],
    ["Served", o.lines.find((x) => x.kitchenStatus === "Served")?.addedAt],
  ]
    .map(
      ([label, time]) =>
        `<div class="${time ? "done" : ""}"><i></i><span>${label}</span><small>${time ? ago(time) : "Pending"}</small></div>`,
    )
    .join("")}</section>`;
}
function billContent(o: RestaurantOrder) {
  const subtotal = mode === "live" ? (o.netTotal ?? orderTotal(o)) : orderTotal(o),
    tax = mode === "live" ? (o.taxes ?? 0) : Math.round(subtotal * 0.16),
    service = mode === "live" ? 0 : Math.round(subtotal * 0.05),
    total = mode === "live" ? (o.grandTotal ?? subtotal + tax) : subtotal + tax + service;
  return `<section class="bill-card"><div class="bill-head"><div><p class="eyebrow">Bill summary</p><h2>${esc(o.name)}</h2></div><span class="bill-status">${esc(o.status)}</span></div>${o.lines.map((x) => `<div class="bill-line"><span>${x.quantity} × ${esc(x.itemName)}</span><b>${money(lineAmount(x))}</b></div>`).join("")}<div class="bill-totals"><p><span>Subtotal</span><b>${money(subtotal)}</b></p><p><span>${mode === "live" && !tax ? "Final taxes at POS billing" : mode === "live" ? "ERPNext taxes" : "Tax preview"}</span><b>${mode === "live" && !tax ? "Pending" : money(tax)}</b></p>${mode === "demo" ? `<p><span>Service charge preview</span><b>${money(service)}</b></p>` : ""}<p class="grand"><span>${mode === "live" && !tax ? "Current subtotal" : "Total"}</span><b>${money(total)}</b></p></div><div class="bill-actions"><button class="secondary" data-action="split-bill">Split bill</button><button class="secondary" data-action="print-preview">Print preview</button><button class="primary" data-action="request-bill">${o.status === "Bill Requested" ? "Bill requested ✓" : "Request bill"}</button></div></section>`;
}
function orderFooter(o: RestaurantOrder) {
  const pending = pendingKitchenLines(o).reduce(
      (n, x) => n + (x.quantity - x.sentQuantity),
      0,
    ),
    subtotal = mode === "live" ? (o.netTotal ?? orderTotal(o)) : orderTotal(o),
    tax = mode === "live" ? (o.taxes ?? 0) : Math.round(subtotal * 0.16),
    total = mode === "live" ? (o.grandTotal ?? subtotal + tax) : subtotal + tax;
  return `<footer class="order-footer"><div><small>${o.lines.reduce((n, x) => n + x.quantity, 0)} items · Tax ${money(tax)}</small><strong>${money(total)}</strong></div>${pending ? `<button class="primary" data-action="send-kitchen">Send ${pending} to kitchen <span>→</span></button>` : `<button class="secondary" data-order-tab="menu">＋ Add more items</button>`}</footer>`;
}

function renderActivity() {
  root.innerHTML = shell(
    `<div class="filter-chips"><button class="active">All</button><button>Kitchen</button><button>Tables</button><button>Sync</button></div><section class="activity-feed">${state.activities.map((x) => `<article><span class="activity-icon ${x.tone || ""}">${x.icon}</span><div><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></div><time>${ago(x.at)}</time></article>`).join("")}</section>`,
    { title: "Activity" },
  );
}
function renderProfile() {
  const initials = state.waiter.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const modeActions = mode === "live"
    ? `<button data-action="restaurant-logout"><span>⇥</span><div><strong>Sign out securely</strong><small>${esc(config?.baseUrl || "ERPNext")}</small></div><b>›</b></button><button data-action="change-server"><span>⌁</span><div><strong>Change ERPNext server</strong><small>Clears the secure Restaurant session</small></div><b>›</b></button>`
    : `<button data-action="toggle-network"><span>${networkOnline ? "◉" : "○"}</span><div><strong>Demo network</strong><small>${networkOnline ? "Online — tap to simulate offline" : "Offline — demo actions stay queued"}</small></div><b>›</b></button><button data-action="reset-demo"><span>↺</span><div><strong>Reset demo data</strong><small>Restore tables and sample orders</small></div><b>›</b></button>`;
  root.innerHTML = shell(
    `<section class="profile-card"><div class="profile-avatar">${esc(initials)}</div><h2>${esc(state.waiter)}</h2><p>Waiter · ${esc(state.branch)}</p><span class="shift-badge">● ${mode === "live" ? "ERPNext connected" : "Demo shift"} · ${ago(state.shiftStarted)}</span></section><section class="settings-list"><button data-action="sync"><span>↻</span><div><strong>Synchronization</strong><small>${state.offlineQueue.length} queued · Last sync ${ago(lastSync)}</small></div><b>›</b></button>${modeActions}<button data-action="failure-states"><span>!</span><div><strong>Failure-state guide</strong><small>Offline, unavailable, conflict and timeout behavior</small></div><b>›</b></button></section><p class="prototype-note">Ai Matic Restaurant v${esc(__APP_VERSION__)} · ${mode === "live" ? "ERPNext is authoritative" : "Isolated demo — no ERPNext transactions"}</p>`,
    { title: "Profile" },
  );
}
function empty(title: string, copy: string) {
  return `<div class="empty"><span>◇</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>`;
}

function openTable(id: string) {
  const table = state.tables.find((x) => x.id === id);
  if (!table) return;
  if (table.orderName) {
    openOrder(table.orderName);
    return;
  }
  modal = `<div class="modal-backdrop"><section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="guest-title"><div class="grabber"></div><p class="eyebrow">New order · ${esc(table.title)}</p><h2 id="guest-title">How many guests?</h2><div class="guest-picker">${[
    1, 2, 3, 4, 5, 6, 7, 8,
  ]
    .slice(0, Math.max(table.capacity, 4))
    .map(
      (n) =>
        `<button data-guests="${n}" class="${n === 2 ? "active" : ""}">${n}</button>`,
    )
    .join(
      "",
    )}</div><div class="sheet-actions"><button class="secondary" data-action="close-modal">Cancel</button><button class="primary" data-create-table="${id}" data-selected-guests="2">Open table</button></div></section></div>`;
  render();
}
async function createOrder(tableId: string, guests: number) {
  const table = state.tables.find((x) => x.id === tableId)!;
  if (mode === "live" && api) {
    if (busy) return;
    busy = true;
    modal = "";
    render();
    try {
      const result = await payload(
        await api.openOrder({
          branch: state.branch,
          floor: seedFloorId(table.floor),
          table: table.id,
          guestCount: guests,
          restaurantProfile,
        }),
      );
      const order = replaceOrder(result.order as Row);
      log("Table opened", `${table.title} · ${guests} guests`, "＋", "green");
      openOrder(order.name);
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "Unable to open table");
    } finally {
      busy = false;
    }
    return;
  }
  const name = `LOCAL-${String(Date.now()).slice(-6)}`;
  const order: RestaurantOrder = {
    name,
    branch: state.branch,
    floor: table.floor,
    table: table.id,
    waiter: state.waiter,
    guestCount: guests,
    status: "Open",
    lines: [],
    posInvoice: null,
    modified: new Date().toISOString(),
    openedAt: new Date().toISOString(),
  };
  state.orders.push(order);
  Object.assign(table, {
    status: "Occupied",
    guests,
    waiter: state.waiter,
    orderName: name,
    openedAt: order.openedAt,
    amount: 0,
  });
  log("Table opened", `${table.title} · ${guests} guests`, "＋", "green");
  save();
  modal = "";
  openOrder(name);
}
function seedFloorId(title: string) {
  return floorIds.get(title) || title;
}
function openOrder(name: string) {
  activeOrderName = name;
  previousScreen = screen;
  screen = "order";
  orderTab = "menu";
  render();
}
async function addItem(
  item: MenuItem,
  mods: RestaurantModifier[] = [],
  notes = "",
  quantity = 1,
) {
  const order = activeOrder();
  if (!order) return;
  if (mode === "live" && api) {
    try {
      busy = true;
      const result = await payload(
        await api.saveOrder(order.name, [
          { itemCode: item.code, quantity, notes, modifiers: mods },
        ]),
      );
      replaceOrder(result.order as Row);
      modal = "";
      flash(`${item.name} added to order`);
    } catch (reason) {
      flash(
        reason instanceof Error ? reason.message : "Item could not be added",
      );
    } finally {
      busy = false;
    }
    return;
  }
  state.orders = state.orders.map((x) =>
    x.name === order.name ? addMenuItem(x, item, mods, notes, quantity) : x,
  );
  updateTable(order.name);
  modal = "";
  save();
  flash(`${item.name} added`);
}
async function changeQuantity(lineId: string, quantity: number) {
  const order = activeOrder();
  if (!order) return;
  if (mode === "live" && api) {
    try {
      busy = true;
      const result = await payload(
        await api.updateUnsentItem(order.name, lineId, Math.max(0, quantity)),
      );
      replaceOrder(result.order as Row);
      render();
    } catch (reason) {
      flash(
        reason instanceof Error
          ? reason.message
          : "Quantity could not be changed",
      );
    } finally {
      busy = false;
    }
    return;
  }
  state.orders = state.orders.map((x) =>
    x.name === order.name ? changeUnsentQuantity(x, lineId, quantity) : x,
  );
  updateTable(order.name);
  save();
  render();
}
async function sendKitchen() {
  const order = activeOrder();
  if (!order) return;
  const requestId = uuid();
  if (mode === "live" && api) {
    if (!networkOnline) return flash("Offline — kitchen request was not sent. Reconnect and retry.");
    try {
      busy = true;
      const result = await payload(await api.sendToKitchen(order.name, requestId));
      replaceOrder(result.order as Row);
      log("Items sent to kitchen", `${pendingKitchenLines(order).length} lines · ${activeTable()?.title}`, "↗", "orange");
      modal = "";
      orderTab = "progress";
      flash(result.duplicate ? "Duplicate request prevented safely" : "Kitchen received the order");
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "Kitchen request failed");
    } finally {
      busy = false;
    }
    return;
  }
  const ticket = createKitchenTicket(order, requestId, `KOT-${Date.now()}`);
  state.orders = state.orders.map((entry) => entry.name === order.name ? applyKitchenTicket(entry, ticket) : entry);
  updateTable(order.name);
  log("Items sent to kitchen", `${ticket.lines.length} items · ${activeTable()?.title}`, "↗", "orange");
  if (!networkOnline) state.offlineQueue.push(`Kitchen request · ${ticket.requestId}`);
  modal = "";
  save();
  orderTab = "progress";
  flash(networkOnline ? "Kitchen received the order" : "Saved in offline demo queue");
}
async function submitBillRequest() {
  const order = activeOrder();
  if (!order) return;
  try {
    if (mode === "live" && api) {
      const result = await payload(await api.requestBill(order.name));
      replaceOrder(result.order as Row);
    } else {
      state.orders = state.orders.map((entry) => entry.name === order.name ? requestBill(entry) : entry);
      updateTable(order.name);
      save();
    }
    log("Bill requested", `${activeTable()?.title} · ${order.name}`, "▣", "blue");
    orderTab = "bill";
    flash("Bill request sent");
  } catch (reason) {
    flash(reason instanceof Error ? reason.message : "Unable to request bill");
  }
}
function openModifier(item: MenuItem) {
  const groups = item.modifiers || [];
  modal = `<div class="modal-backdrop"><section class="bottom-sheet modifier-sheet" role="dialog" aria-modal="true"><div class="grabber"></div><div class="sheet-title"><div><p class="eyebrow">Customize item</p><h2>${esc(item.name)}</h2></div><button data-action="close-modal" class="icon-button">×</button></div><form id="modifier-form" data-item-code="${item.code}">${groups.map((g, gi) => `<fieldset><legend>${esc(g.title)} ${g.required ? "<b>Required</b>" : ""}</legend>${g.options.map((o, oi) => `<label class="option-row"><input type="${g.multiple ? "checkbox" : "radio"}" name="group-${gi}" value="${o.code}" data-label="${esc(o.label)}" data-price="${o.price}" ${g.required && oi === 0 ? "checked" : ""}><span>${esc(o.label)}</span><b>${o.price ? `+ ${money(o.price)}` : "Included"}</b></label>`).join("")}</fieldset>`).join("")}<label class="note-field">Cooking instructions<textarea name="note" rows="2" placeholder="No onion, less spicy…"></textarea></label><label class="allergy"><input type="checkbox" name="allergy"> Allergy information included in note</label><div class="modifier-footer"><div class="qty"><button type="button" data-modal-qty="-1">−</button><input name="quantity" value="1" inputmode="numeric"><button type="button" data-modal-qty="1">＋</button></div><button class="primary" type="submit">Add to order · <span>${money(item.price)}</span></button></div></form></section></div>`;
  render();
}
function confirmKitchen(o: RestaurantOrder) {
  const pending = pendingKitchenLines(o);
  modal = `<div class="modal-backdrop"><section class="bottom-sheet" role="dialog" aria-modal="true"><div class="grabber"></div><p class="eyebrow">Kitchen confirmation</p><h2>Send ${pending.reduce((n, x) => n + x.quantity - x.sentQuantity, 0)} new items?</h2><div class="kitchen-summary">${pending.map((x) => `<div><span>${x.quantity - x.sentQuantity} × ${esc(x.itemName)}<small>${esc(x.notes || x.modifiers.map((m) => m.label).join(", ") || "Standard")}</small></span><b>${esc(x.station || "Kitchen")}</b></div>`).join("")}</div><div class="estimate"><span>◴ Estimated preparation</span><strong>${Math.max(...pending.map((x) => menu.find((m) => m.code === x.itemCode)?.prepMinutes || 10))}–${Math.max(...pending.map((x) => menu.find((m) => m.code === x.itemCode)?.prepMinutes || 10)) + 5} min</strong></div><div class="sheet-actions three"><button class="secondary" data-action="close-modal">Go back</button><button class="secondary" data-action="save-local">Save only</button><button class="primary" data-action="confirm-kitchen">Send now</button></div></section></div>`;
  render();
}
function failureModal() {
  modal = `<div class="modal-backdrop"><section class="bottom-sheet"><div class="grabber"></div><div class="sheet-title"><div><p class="eyebrow">Operational resilience</p><h2>Failure states</h2></div><button data-action="close-modal" class="icon-button">×</button></div><div class="failure-list">${[
    ["○", "Offline mode", "Actions are saved locally and visibly queued."],
    [
      "↻",
      "Pending synchronization",
      "1 waiter action will retry automatically.",
    ],
    ["!", "Failed submission", "Retry keeps the original request ID."],
    [
      "⊘",
      "Duplicate prevented",
      "A matching kitchen request was already received.",
    ],
    ["⌁", "Session expired", "Sign in again without losing the current order."],
    ["×", "Item unavailable", "Keep other items and choose a replacement."],
    ["↕", "Price changed", "Review the new price before continuing."],
    ["▦", "Table conflict", "Another waiter opened this table first."],
    [
      "◴",
      "Kitchen timeout",
      "Request status can be checked and retried safely.",
    ],
  ]
    .map(
      ([i, t, c]) =>
        `<article><span>${i}</span><div><strong>${t}</strong><small>${c}</small></div><button data-action="failure-retry">Retry</button></article>`,
    )
    .join("")}</div></section></div>`;
  render();
}

function render() {
  if (screen === "home") renderHome();
  else if (screen === "tables") renderTables();
  else if (screen === "orders") renderOrders();
  else if (screen === "menu") renderMenu();
  else if (screen === "activity") renderActivity();
  else if (screen === "profile") renderProfile();
  else renderOrder();
}
function setScreen(next: Screen) {
  modal = "";
  previousScreen = screen;
  screen = next;
  render();
}

root.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button) return;
  const ds = button.dataset;
  if (ds.screen) return setScreen(ds.screen as Screen);
  if (ds.floor) {
    floor = ds.floor;
    render();
    return;
  }
  if (ds.view) {
    viewMode = ds.view as ViewMode;
    render();
    return;
  }
  if (ds.orderFilter) {
    orderFilter = ds.orderFilter;
    render();
    return;
  }
  if (ds.table) {
    openTable(ds.table);
    return;
  }
  if (ds.order) {
    openOrder(ds.order);
    return;
  }
  if (ds.orderTab) {
    orderTab = ds.orderTab as typeof orderTab;
    render();
    return;
  }
  if (ds.category) {
    category = ds.category;
    render();
    return;
  }
  if (ds.guests) {
    document
      .querySelectorAll("[data-guests]")
      .forEach((x) =>
        x.classList.toggle(
          "active",
          (x as HTMLElement).dataset.guests === ds.guests,
        ),
      );
    document.querySelector<HTMLElement>(
      "[data-create-table]",
    )!.dataset.selectedGuests = ds.guests;
    return;
  }
  if (ds.createTable) {
    void createOrder(ds.createTable, Number(ds.selectedGuests) || 2);
    return;
  }
  if (ds.menuItem) {
    const item = menu.find((x) => x.code === ds.menuItem)!;
    if (screen !== "order" || !activeOrder()) {
      flash("Choose a table before adding items.");
      return;
    }
    if (item.modifiers?.length) openModifier(item);
    else void addItem(item);
    return;
  }
  if (ds.qty) {
    const o = activeOrder()!,
      line = o.lines.find((x) => x.id === ds.line)!;
    void changeQuantity(line.id, line.quantity + Number(ds.qty));
    return;
  }
  if (ds.modalQty) {
    const input = document.querySelector<HTMLInputElement>(
      'input[name="quantity"]',
    )!;
    input.value = String(
      Math.max(1, Number(input.value || 1) + Number(ds.modalQty)),
    );
    return;
  }
  const action = ds.action;
  if (action === "back") {
    setScreen(previousScreen === "order" ? "tables" : previousScreen);
    return;
  }
  if (action === "new-order") {
    screen = "tables";
    floor = floors[0];
    render();
    flash("Select an available table");
    return;
  }
  if (action === "close-modal") {
    modal = "";
    render();
    return;
  }
  if (action === "send-kitchen") {
    confirmKitchen(activeOrder()!);
    return;
  }
  if (action === "confirm-kitchen") {
    void sendKitchen();
    return;
  }
  if (action === "save-local") {
    if (mode === "live") {
      modal = "";
      flash("Order is already saved in ERPNext; it has not been sent to kitchen.");
      return;
    }
    state.offlineQueue.push(`Draft items · ${activeTable()?.title}`);
    save();
    modal = "";
    flash("Saved locally — not sent to kitchen");
    return;
  }
  if (action === "request-bill") {
    void submitBillRequest();
    return;
  }
  if (action === "advance-line") {
    if (mode === "live") {
      flash("Kitchen status is controlled by authorized kitchen staff.");
      return;
    }
    const o = activeOrder()!;
    state.orders = state.orders.map((x) =>
      x.name === o.name
        ? {
            ...x,
            lines: x.lines.map((l) =>
              l.id === ds.line
                ? { ...l, kitchenStatus: nextKitchenStatus(l.kitchenStatus) }
                : l,
            ),
          }
        : x,
    );
    updateTable(o.name);
    save();
    render();
    return;
  }
  if (action === "add-guest") {
    const o = activeOrder()!;
    o.guestCount++;
    const t = activeTable();
    if (t) t.guests = o.guestCount;
    save();
    flash("Guest added");
    return;
  }
  if (action === "table-note") {
    flash("Table note saved in prototype");
    return;
  }
  if (action === "transfer") {
    flash("Transfer table is a prototype preview");
    return;
  }
  if (action === "sync") {
    if (!networkOnline) {
      flash("Offline — actions remain safely queued");
      return;
    }
    if (mode === "live") {
      void loadWorkspace();
    } else {
      state.offlineQueue = [];
      lastSync = new Date().toISOString();
      save();
      flash("Everything is synchronized");
    }
    return;
  }
  if (action === "toggle-network") {
    networkOnline = !networkOnline;
    render();
    return;
  }
  if (action === "failure-states") {
    failureModal();
    return;
  }
  if (action === "failure-retry") {
    flash(
      networkOnline
        ? "Retry succeeded"
        : "Still offline — action remains queued",
    );
    return;
  }
  if (action === "reset-demo") {
    state = cloneSeed();
    save();
    screen = "home";
    render();
    return;
  }
  if (action === "restaurant-logout") {
    void credentials?.clear().then(() => signIn());
    return;
  }
  if (action === "change-server") {
    void changeServer();
    return;
  }
  if (
    action === "split-bill" ||
    action === "print-preview" ||
    action === "order-more" ||
    action === "scan"
  ) {
    flash("Prototype action ready for backend integration");
    return;
  }
});
root.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "table-search") {
    tableSearch = input.value;
    const position = input.selectionStart;
    renderTables();
    const next = document.querySelector<HTMLInputElement>("#table-search");
    next?.focus();
    next?.setSelectionRange(position, position);
  }
  if (input.id === "menu-search") {
    menuSearch = input.value;
    render();
    const next = document.querySelector<HTMLInputElement>("#menu-search");
    next?.focus();
    next?.setSelectionRange(input.value.length, input.value.length);
  }
});
root.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.qtyInput) {
    void changeQuantity(input.dataset.line!, Math.max(0, Number(input.value) || 0));
  }
});
root.addEventListener("submit", (event) => {
  const form = (event.target as Element).closest<HTMLFormElement>(
    "#modifier-form",
  );
  if (!form) return;
  event.preventDefault();
  const item = menu.find((x) => x.code === form.dataset.itemCode)!;
  const data = new FormData(form),
    mods: RestaurantModifier[] = [];
  form
    .querySelectorAll<HTMLInputElement>(
      'input[type="radio"]:checked,input[type="checkbox"]:checked[data-label]',
    )
    .forEach((x) =>
      mods.push({
        code: x.value,
        label: x.dataset.label || x.value,
        price: Number(x.dataset.price) || 0,
      }),
    );
  void addItem(
    item,
    mods,
    String(data.get("note") || ""),
    Math.max(1, Number(data.get("quantity")) || 1),
  );
});
function updateTable(orderName: string) {
  const o = state.orders.find((x) => x.name === orderName),
    t = state.tables.find((x) => x.orderName === orderName);
  if (o && t) {
    t.status = statusForOrder(o);
    t.amount = orderTotal(o);
  }
}
addEventListener("online", () => {
  networkOnline = true;
  flash("Back online — ready to synchronize");
});
addEventListener("offline", () => {
  networkOnline = false;
  flash("Offline mode — actions will be preserved");
});
void startRestaurant();
