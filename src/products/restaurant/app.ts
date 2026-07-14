import { createApiClient } from "../../api/client";
import { createRestaurantApi } from "../../api/restaurant";

declare const __APP_VERSION__: string;

type Row = Record<string, unknown>;
interface Bootstrap { branches: Row[]; floors: Row[]; tables: Row[]; categories: string[]; items: Row[]; }
interface CartLine { itemCode: string; itemName: string; quantity: number; uom: string; notes: string; modifiers: Array<{code:string;label:string;price:number}>; }

const root = document.querySelector<HTMLElement>("#app")!;
let baseUrl = localStorage.getItem("aimatic-restaurant-url") || "";
let api: ReturnType<typeof createRestaurantApi> | null = null;
let bootstrap: Bootstrap = { branches: [], floors: [], tables: [], categories: [], items: [] };
let branch = "", floor = "", category = "", activeTable: Row | null = null, activeOrder: Row | null = null;
let cart: CartLine[] = [];

const esc = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]!));
const field = (row: Row, ...keys: string[]) => { for (const key of keys) if (row[key] !== undefined && row[key] !== null) return String(row[key]); return ""; };
const payload = async (response: Response): Promise<Row> => {
  const body = await response.json().catch(() => ({})) as Row;
  if (!response.ok) throw new Error(field(body, "message", "exception") || `Server error ${response.status}`);
  return (body.message && typeof body.message === "object" ? body.message : body) as Row;
};
const message = (text: string) => `<div class="message">${esc(text)}</div>`;

function loginScreen(error = "") {
  root.innerHTML = `<section class="shell"><div class="panel login"><div class="brand"><h1>Ai Matic Restaurant</h1><p>Waiter ordering · v${esc(__APP_VERSION__)}</p></div>${error ? message(error) : ""}<form id="login" class="stack"><label>ERPNext URL<input id="url" type="url" required value="${esc(baseUrl)}" placeholder="https://erp.example.com"></label><label>Email<input id="user" type="email" required autocomplete="username"></label><label>Password<input id="password" type="password" required autocomplete="current-password"></label><button class="primary">Sign in</button></form></div></section>`;
  document.querySelector<HTMLFormElement>("#login")!.onsubmit = async (event) => {
    event.preventDefault();
    baseUrl = (document.querySelector<HTMLInputElement>("#url")!.value || "").replace(/\/+$/, "");
    const usr = document.querySelector<HTMLInputElement>("#user")!.value;
    const pwd = document.querySelector<HTMLInputElement>("#password")!.value;
    try {
      const response = await fetch(`${baseUrl}/api/method/login`, { method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ usr, pwd }) });
      await payload(response);
      localStorage.setItem("aimatic-restaurant-url", baseUrl);
      api = createRestaurantApi(createApiClient({ baseUrl, authentication: { mode: "session" }, fetch: globalThis.fetch.bind(globalThis) }));
      await loadBootstrap();
    } catch (err) { loginScreen(err instanceof Error ? err.message : "Login failed"); }
  };
}

async function loadBootstrap() {
  try {
    const data = await payload(await api!.getBootstrap(branch || undefined));
    bootstrap = {
      branches: Array.isArray(data.branches) ? data.branches as Row[] : [], floors: Array.isArray(data.floors) ? data.floors as Row[] : [],
      tables: Array.isArray(data.tables) ? data.tables as Row[] : [], categories: Array.isArray(data.categories) ? data.categories.map(String) : [],
      items: Array.isArray(data.items) ? data.items as Row[] : []
    };
    branch ||= field(bootstrap.branches[0] ?? {}, "name", "branch");
    floor ||= field(bootstrap.floors.find((x) => !branch || field(x,"branch") === branch) ?? {}, "name", "floor");
    category ||= bootstrap.categories[0] || "All";
    renderTables();
  } catch (err) { loginScreen(err instanceof Error ? err.message : "Unable to load restaurant"); }
}

function header(subtitle: string) { return `<header class="topbar"><div class="brand"><h1>Ai Matic Restaurant</h1><p>${esc(subtitle)}</p></div><button id="logout" class="secondary">Logout</button></header>`; }
function bindLogout(){ document.querySelector<HTMLButtonElement>("#logout")!.onclick=async()=>{await fetch(`${baseUrl}/api/method/logout`,{method:"POST",credentials:"include"}).catch(()=>{});api=null;loginScreen();}; }

function renderTables(error = "") {
  const floors = bootstrap.floors.filter((x) => !branch || field(x,"branch") === branch);
  const tables = bootstrap.tables.filter((x) => (!branch || field(x,"branch") === branch) && (!floor || field(x,"floor") === floor));
  root.innerHTML = `<section class="shell">${header("Floor and table selection")}${error ? message(error) : ""}<div class="panel stack"><div class="filters"><label>Branch<select id="branch">${bootstrap.branches.map(x=>`<option ${field(x,"name","branch")===branch?"selected":""}>${esc(field(x,"name","branch"))}</option>`).join("")}</select></label><label>Floor<select id="floor">${floors.map(x=>`<option ${field(x,"name","floor")===floor?"selected":""}>${esc(field(x,"name","floor"))}</option>`).join("")}</select></label></div><div class="table-grid">${tables.map(x=>`<button class="table-card ${field(x,"status")==="Open"?"open":""}" data-table="${esc(field(x,"name","table"))}"><strong>${esc(field(x,"title","name","table"))}</strong><span>${esc(field(x,"status")||"Available")}</span><small>${esc(field(x,"waiter"))}</small></button>`).join("") || '<div class="empty">No tables configured for this floor.</div>'}</div></div></section>`;
  bindLogout();
  document.querySelector<HTMLSelectElement>("#branch")!.onchange=async(e)=>{branch=(e.target as HTMLSelectElement).value;floor="";await loadBootstrap();};
  document.querySelector<HTMLSelectElement>("#floor")!.onchange=(e)=>{floor=(e.target as HTMLSelectElement).value;renderTables();};
  document.querySelectorAll<HTMLButtonElement>("[data-table]").forEach(btn=>btn.onclick=()=>void openTable(btn.dataset.table!));
}

async function openTable(tableName: string) {
  activeTable = bootstrap.tables.find(x=>field(x,"name","table")===tableName) ?? {name:tableName};
  try {
    const existing = await payload(await api!.getTableOrder(tableName));
    activeOrder = existing.order && typeof existing.order === "object" ? existing.order as Row : null;
    if (!activeOrder) {
      const guests = Number(prompt("Guest count", "2") || 0); if (!guests) return;
      const opened = await payload(await api!.openOrder({branch,floor,table:tableName,guestCount:guests}));
      activeOrder = (opened.order && typeof opened.order === "object" ? opened.order : opened) as Row;
    }
    cart = [];
    renderOrder();
  } catch(err){renderTables(err instanceof Error?err.message:"Unable to open table");}
}

function renderOrder(error = "") {
  const items = bootstrap.items.filter(x=>category==="All"||!category||field(x,"item_group","category")===category);
  root.innerHTML=`<section class="shell">${header(`${field(activeTable!,"title","name")} · ${field(activeOrder!,"status")||"Open"}`)}${error?message(error):""}<button id="back" class="back">← Tables</button><div class="layout"><section><div class="categories"><button data-category="All" class="${category==="All"?"primary":"secondary"}">All</button>${bootstrap.categories.map(x=>`<button data-category="${esc(x)}" class="${category===x?"primary":"secondary"}">${esc(x)}</button>`).join("")}</div><div class="menu-grid">${items.map(x=>`<button class="menu-card" data-item="${esc(field(x,"item_code","name"))}"><strong>${esc(field(x,"item_name","name"))}</strong><span>${esc(field(x,"formatted_rate","rate"))}</span><small>${esc(field(x,"item_group"))}</small></button>`).join("")||'<div class="empty">No menu items.</div>'}</div></section><aside class="panel cart"><h2>New items</h2>${cart.map((x,i)=>`<div class="line"><div class="line-head"><strong>${esc(x.itemName)}</strong><span>× ${x.quantity}</span></div><small>${esc(x.notes||x.modifiers.map(m=>m.label).join(", "))}</small><button class="back" data-remove="${i}">Remove</button></div>`).join("")||'<div class="empty">Tap a menu item to add it.</div>'}<div class="actions"><button id="save" class="secondary">Save</button><button id="kitchen" class="primary">Send to kitchen</button><button id="bill" class="secondary">Request bill</button><button id="close" class="danger">Close table</button></div></aside></div></section>`;
  bindLogout(); document.querySelector<HTMLButtonElement>("#back")!.onclick=()=>renderTables();
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach(b=>b.onclick=()=>{category=b.dataset.category!;renderOrder();});
  document.querySelectorAll<HTMLButtonElement>("[data-item]").forEach(b=>b.onclick=()=>addItem(b.dataset.item!));
  document.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderOrder();});
  document.querySelector<HTMLButtonElement>("#save")!.onclick=()=>void save(false);
  document.querySelector<HTMLButtonElement>("#kitchen")!.onclick=()=>void save(true);
  document.querySelector<HTMLButtonElement>("#bill")!.onclick=()=>void action("bill");
  document.querySelector<HTMLButtonElement>("#close")!.onclick=()=>void action("close");
}

function addItem(code:string){const item=bootstrap.items.find(x=>field(x,"item_code","name")===code)!;const available=Array.isArray(item.modifiers)?item.modifiers as Row[]:[];const modifiers=available.filter(x=>confirm(`Add ${field(x,"label","name")}${field(x,"formatted_price","price")?` (${field(x,"formatted_price","price")})`:""}?`)).map(x=>({code:field(x,"code","name"),label:field(x,"label","name"),price:Number(x.price)||0}));const notes=prompt("Cooking instructions (optional)","")||"";cart.push({itemCode:code,itemName:field(item,"item_name","name"),quantity:1,uom:field(item,"uom","stock_uom")||"Nos",notes,modifiers});renderOrder();}
async function save(send:boolean){if(!cart.length)return renderOrder("Add at least one item.");try{await payload(await api!.saveOrder(field(activeOrder!,"name"),cart));cart=[];if(send)await payload(await api!.sendToKitchen(field(activeOrder!,"name"),crypto.randomUUID()));renderOrder(send?"Order sent to kitchen.":"Order saved.");}catch(err){renderOrder(err instanceof Error?err.message:"Unable to save order");}}
async function action(type:"bill"|"close"){try{if(type==="bill")await payload(await api!.requestBill(field(activeOrder!,"name")));else{const invoice=prompt("Submitted POS Invoice","")||"";if(!invoice)return;await payload(await api!.closeTable(field(activeOrder!,"name"),invoice));}await loadBootstrap();}catch(err){renderOrder(err instanceof Error?err.message:"Action failed");}}

loginScreen();
