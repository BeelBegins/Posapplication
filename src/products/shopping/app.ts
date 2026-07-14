import { createApiClient } from "../../api/client";
import { createShoppingApi } from "../../api/shopping";
import { addCartLine, cartDisplaySubtotal, emptyCart, setCartQuantity, type ShoppingCart, type ShoppingQuote } from "./domain";

declare const __APP_VERSION__: string;

type Row = Record<string, unknown>;
type Screen = "home" | "catalog" | "cart" | "login" | "checkout" | "orders";

const root = document.querySelector<HTMLElement>("#app")!;
const storageKey = "aimatic-shopping-cart-v1";
let baseUrl = localStorage.getItem("aimatic-shopping-url") || "";
let api: ReturnType<typeof createShoppingApi> | null = null;
let screen: Screen = "home";
let storefront: Row = {};
let products: Row[] = [];
let category = "";
let search = "";
let notice = "";
let account: Row | null = null;
let orderHistory: Row[] = [];
let quote: ShoppingQuote | null = null;
let cart = loadCart();

const esc = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]!));
const field = (row: Row, ...keys: string[]) => { for (const key of keys) if (row[key] !== undefined && row[key] !== null) return String(row[key]); return ""; };
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((row): row is Row => Boolean(row) && typeof row === "object") : [];
const money = (value: unknown, currency = field(storefront, "currency") || "PKR") => `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const image = (row: Row) => field(row, "image_url", "website_image", "image") || "";

function loadCart(): ShoppingCart {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as ShoppingCart | null;
    if (saved && Array.isArray(saved.lines)) return saved;
  } catch { /* discard corrupt local draft */ }
  return emptyCart();
}

function saveCart(next: ShoppingCart) {
  cart = next;
  quote = null;
  localStorage.setItem(storageKey, JSON.stringify(cart));
}

async function body(response: Response): Promise<Row> {
  const value = await response.json().catch(() => ({})) as Row;
  if (!response.ok) throw new Error(field(value, "message", "exception") || `Server error ${response.status}`);
  return value.message && typeof value.message === "object" ? value.message as Row : value;
}

function connect(url: string) {
  baseUrl = url.replace(/\/+$/, "");
  api = createShoppingApi(createApiClient({ baseUrl, authentication: { mode: "session" }, fetch: globalThis.fetch.bind(globalThis) }));
}

function setup(error = "") {
  root.innerHTML = `<section class="setup"><div class="setup-card"><div class="logo">AM</div><h1>Ai Matic Shopping</h1><p>Connect to your store to start shopping.</p>${error ? `<p class="notice">${esc(error)}</p>` : ""}<form id="setup"><label>Store URL<input id="url" type="url" required value="${esc(baseUrl)}" placeholder="https://shop.example.com"></label><button class="primary">Open store</button></form><small>v${esc(__APP_VERSION__)}</small></div></section>`;
  document.querySelector<HTMLFormElement>("#setup")!.onsubmit = async (event) => {
    event.preventDefault();
    const url = document.querySelector<HTMLInputElement>("#url")!.value;
    try { connect(url); await loadStore(); localStorage.setItem("aimatic-shopping-url", baseUrl); }
    catch (error) { setup(error instanceof Error ? error.message : "Store unavailable"); }
  };
}

async function loadStore() {
  storefront = await body(await api!.getStorefront(cart.branch || undefined));
  cart.branch ||= field(storefront, "branch") || null;
  saveCart(cart);
  account = await api!.getAccount().then(body).catch(() => null);
  await loadProducts();
  render("home");
}

async function loadProducts() {
  const result = await body(await api!.searchProducts({ branch: cart.branch || undefined, category: category || undefined, search: search || undefined }));
  products = rows(result.products ?? result.items);
}

function header() {
  const count = cart.lines.reduce((total, line) => total + line.quantity, 0);
  return `<header><button class="wordmark" data-screen="home"><span>AM</span><strong>${esc(field(storefront, "store_name") || "Ai Matic")}</strong></button><button id="search-open" class="search-button">Search products</button><div class="head-actions"><button data-screen="${account ? "orders" : "login"}" aria-label="Account">${account ? "Orders" : "Sign in"}</button><button class="cart-button" data-screen="cart" aria-label="Cart">Cart <b>${esc(count)}</b></button></div></header>`;
}

async function openScreen(next: Screen) {
  if (next === "orders" && account) {
    try {
      const result = await body(await api!.getOrders());
      orderHistory = rows(result.orders);
    } catch (error) {
      notice = error instanceof Error ? error.message : "Unable to load orders";
    }
  }
  render(next);
}

function nav() {
  return `<nav><button data-screen="home">Home</button><button data-screen="catalog">Shop</button><button data-screen="cart">Cart</button><button data-screen="${account ? "orders" : "login"}">${account ? "Orders" : "Account"}</button></nav>`;
}

function productCards(list: Row[]) {
  return `<div class="product-grid">${list.map((product) => {
    const code = field(product, "item_code", "name");
    const src = image(product);
    return `<article class="product-card">${src ? `<img src="${esc(src)}" alt="">` : `<div class="image-fallback">${esc(field(product,"item_name","name").slice(0,2))}</div>`}<div><small>${esc(field(product,"brand","item_group"))}</small><h3>${esc(field(product,"item_name","name"))}</h3><p>${money(field(product,"rate","price"))}</p><button class="primary add" data-item="${esc(code)}">Add to cart</button></div></article>`;
  }).join("") || `<p class="empty">No products found.</p>`}</div>`;
}

function homeView() {
  const banners = rows(storefront.banners);
  const categories = rows(storefront.categories);
  return `<section class="page"><div class="hero">${image(banners[0] || {}) ? `<img src="${esc(image(banners[0]))}" alt="">` : ""}<div><p>SHOP ONLINE</p><h1>${esc(field(banners[0] || storefront,"title","headline") || "Everyday essentials, delivered")}</h1><button class="light" data-screen="catalog">Browse products</button></div></div><section class="section"><div class="section-title"><h2>Shop by category</h2><button data-screen="catalog">View all</button></div><div class="category-row">${categories.map((item) => `<button class="category" data-category="${esc(field(item,"name","category"))}">${image(item) ? `<img src="${esc(image(item))}" alt="">` : ""}<strong>${esc(field(item,"label","name","category"))}</strong></button>`).join("") || "<p>Categories will appear here.</p>"}</div></section><section class="section"><div class="section-title"><h2>Featured</h2></div>${productCards(products.slice(0,8))}</section></section>`;
}

function catalogView() {
  const categories = rows(storefront.categories);
  return `<section class="page"><form id="search" class="search"><input id="query" value="${esc(search)}" placeholder="Search products, categories, brands"><button class="primary">Search</button></form><div class="chips"><button data-category="" class="${!category?"active":""}">All</button>${categories.map((item) => { const value=field(item,"name","category"); return `<button data-category="${esc(value)}" class="${value===category?"active":""}">${esc(field(item,"label","name","category"))}</button>`; }).join("")}</div>${productCards(products)}</section>`;
}

function cartView() {
  return `<section class="page narrow"><h1>Your cart</h1>${notice ? `<p class="notice">${esc(notice)}</p>` : ""}<div class="cart-lines">${cart.lines.map((line) => `<article class="cart-line">${line.imageUrl ? `<img src="${esc(line.imageUrl)}" alt="">` : `<div class="thumb"></div>`}<div><h3>${esc(line.itemName)}</h3><small>${esc(line.modifiers.map((modifier)=>modifier.value).join(" · "))}</small><p>${money(line.displayedRate)}</p></div><div class="quantity"><button data-quantity="${esc(line.id)}" data-delta="-1">−</button><b>${esc(line.quantity)}</b><button data-quantity="${esc(line.id)}" data-delta="1">+</button></div></article>`).join("") || `<div class="empty"><h2>Your cart is empty</h2><button class="primary" data-screen="catalog">Start shopping</button></div>`}</div>${cart.lines.length ? `<aside class="summary"><p><span>Estimated subtotal</span><strong>${money(cartDisplaySubtotal(cart))}</strong></p><small>ERPNext confirms pricing, promotions, stock, tax, and delivery at checkout.</small><button id="checkout" class="primary wide">Continue to checkout</button></aside>` : ""}</section>`;
}

function loginView() {
  return `<section class="page narrow"><div class="form-card"><h1>Customer sign in</h1><p>Sign in to use saved addresses, checkout, and track orders.</p>${notice ? `<p class="notice">${esc(notice)}</p>` : ""}<form id="login"><label>Email<input id="email" type="email" autocomplete="username" required></label><label>Password<input id="password" type="password" autocomplete="current-password" required></label><button class="primary wide">Sign in</button></form><small>This customer login does not expose the ERPNext desk.</small></div></section>`;
}

function checkoutView() {
  const addresses = rows(account?.addresses);
  const delivery = rows(storefront.delivery_methods);
  const payments = rows(storefront.payment_methods);
  return `<section class="page narrow"><h1>Checkout</h1>${notice ? `<p class="notice">${esc(notice)}</p>` : ""}<form id="place" class="form-card"><label>Delivery address<select id="address" required>${addresses.map((item)=>`<option value="${esc(field(item,"name"))}">${esc(field(item,"label","address_title","name"))}</option>`).join("")}</select></label><label>Delivery method<select id="delivery" required>${delivery.map((item)=>`<option value="${esc(field(item,"name"))}">${esc(field(item,"label","name"))}</option>`).join("")}</select></label><label>Payment method<select id="payment" required>${payments.map((item)=>`<option value="${esc(field(item,"name"))}">${esc(field(item,"label","name"))}</option>`).join("")}</select></label><button id="refresh-quote" type="button">Refresh totals</button>${quote ? `<div class="totals"><p><span>Subtotal</span><b>${money(quote.subtotal,quote.currency)}</b></p><p><span>Discount</span><b>− ${money(quote.discount,quote.currency)}</b></p><p><span>Tax</span><b>${money(quote.taxes,quote.currency)}</b></p><p><span>Delivery</span><b>${money(quote.deliveryCharge,quote.currency)}</b></p><p class="grand"><span>Total</span><b>${money(quote.grandTotal,quote.currency)}</b></p></div><button class="primary wide">Place order</button>` : `<p>Refresh totals to confirm current prices and availability.</p>`}</form></section>`;
}

function ordersView() {
  return `<section class="page narrow"><div class="section-title"><h1>My orders</h1><button id="logout">Sign out</button></div>${notice ? `<p class="notice">${esc(notice)}</p>` : ""}<div class="order-list">${orderHistory.map((order)=>`<article><div><strong>${esc(field(order,"name","order"))}</strong><small>${esc(field(order,"creation","date"))}</small></div><div><span>${esc(field(order,"delivery_status","status"))}</span><b>${money(field(order,"grand_total"),field(order,"currency")||undefined)}</b></div></article>`).join("") || `<p class="empty">No orders yet.</p>`}</div></section>`;
}

function render(next: Screen = screen) {
  screen = next;
  const content = screen === "home" ? homeView() : screen === "catalog" ? catalogView() : screen === "cart" ? cartView() : screen === "login" ? loginView() : screen === "checkout" ? checkoutView() : ordersView();
  root.innerHTML = `${header()}${content}${nav()}`;
  bind();
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => button.onclick = () => void openScreen(button.dataset.screen as Screen));
  document.querySelector<HTMLButtonElement>("#search-open")!.onclick = () => render("catalog");
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => button.onclick = async () => { category=button.dataset.category || ""; await loadProducts(); render("catalog"); });
  document.querySelectorAll<HTMLButtonElement>(".add").forEach((button) => button.onclick = () => {
    const product = products.find((item)=>field(item,"item_code","name")===button.dataset.item)!;
    saveCart(addCartLine(cart,{itemCode:field(product,"item_code","name"),itemName:field(product,"item_name","name"),imageUrl:image(product)||null,uom:field(product,"uom","stock_uom")||"Nos",displayedRate:Number(field(product,"rate","price"))||0,modifiers:[]}));
    notice = "Added to cart."; render(screen);
  });
  document.querySelector<HTMLFormElement>("#search")?.addEventListener("submit", async (event)=>{event.preventDefault();search=document.querySelector<HTMLInputElement>("#query")!.value;await loadProducts();render("catalog");});
  document.querySelectorAll<HTMLButtonElement>("[data-quantity]").forEach((button)=>button.onclick=()=>{const line=cart.lines.find((item)=>item.id===button.dataset.quantity)!;saveCart(setCartQuantity(cart,line.id,line.quantity+Number(button.dataset.delta)));render("cart");});
  document.querySelector<HTMLButtonElement>("#checkout")?.addEventListener("click",()=>{notice="";render(account?"checkout":"login");});
  document.querySelector<HTMLFormElement>("#login")?.addEventListener("submit",async(event)=>{event.preventDefault();try{account=await body(await api!.login(document.querySelector<HTMLInputElement>("#email")!.value,document.querySelector<HTMLInputElement>("#password")!.value));notice="";render("checkout");}catch(error){notice=error instanceof Error?error.message:"Sign in failed";render("login");}});
  document.querySelector<HTMLButtonElement>("#refresh-quote")?.addEventListener("click",()=>void refreshQuote());
  document.querySelector<HTMLFormElement>("#place")?.addEventListener("submit",(event)=>void placeOrder(event));
  document.querySelector<HTMLButtonElement>("#logout")?.addEventListener("click",async()=>{await api!.logout().catch(()=>null);account=null;notice="Signed out.";render("home");});
}

async function refreshQuote() {
  try {
    const address=document.querySelector<HTMLSelectElement>("#address")!.value;
    const delivery=document.querySelector<HTMLSelectElement>("#delivery")!.value;
    quote=await body(await api!.quoteCart(cart,delivery,address)) as unknown as ShoppingQuote;
    notice=""; render("checkout");
  } catch(error) { notice=error instanceof Error?error.message:"Unable to refresh totals";render("checkout"); }
}

async function placeOrder(event: SubmitEvent) {
  event.preventDefault();
  if(!quote)return refreshQuote();
  try {
    const result=await body(await api!.placeOrder({requestId:crypto.randomUUID(),quoteToken:quote.quoteToken,addressName:document.querySelector<HTMLSelectElement>("#address")!.value,deliveryMethod:document.querySelector<HTMLSelectElement>("#delivery")!.value,paymentMethod:document.querySelector<HTMLSelectElement>("#payment")!.value}));
    saveCart(emptyCart()); quote=null; notice=`Order ${field(result,"sales_order","order","name")} placed successfully.`;
    account=await body(await api!.getAccount()); await openScreen("orders");
  } catch(error) { notice=error instanceof Error?error.message:"Order could not be placed";render("checkout"); }
}

if (baseUrl) { connect(baseUrl); void loadStore().catch((error)=>setup(error instanceof Error?error.message:"Store unavailable")); }
else setup();
