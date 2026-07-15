import { createApiClient } from "../../api/client";
import { createShoppingApi } from "../../api/shopping";
import { addCartLine, assertCheckoutReady, cartDisplaySubtotal, emptyCart, ensureCheckoutAttempt, setCartQuantity, type ShoppingCart, type ShoppingCheckoutAttempt, type ShoppingQuote } from "./domain";
import { capacitorOAuthBrowser } from "../../mobile/capacitor-oauth-browser";
import { OAuthPkceCredentialProvider, type OAuthPublicClientConfig } from "../../mobile/credential-provider";
import { androidSecureStorage } from "../../mobile/secure-storage";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { sessionSecureStorage } from "../../web/session-storage";
import { completePopupOAuthCallback, webOAuthBrowser } from "../../web/oauth-browser";
import { bottomNavigation, emptyState, escapeHtml as esc, formatMoney, loadingSkeleton, statusBadge, type UiTone } from "../shared/ui";

declare const __APP_VERSION__: string;

type Row = Record<string, unknown>;
type Screen = "home" | "categories" | "catalog" | "product" | "cart" | "login" | "register" | "checkout" | "orders" | "order" | "account";

const root = document.querySelector<HTMLElement>("#app")!;
const storageKey = "aimatic-shopping-cart-v1";
const checkoutKey = "aimatic-shopping-checkout-v1";
const isNative = Capacitor.isNativePlatform();
const isOAuthCallback = !isNative && completePopupOAuthCallback();
let baseUrl = localStorage.getItem("aimatic-shopping-url") || (isNative ? "" : location.origin);
let api: ReturnType<typeof createShoppingApi> | null = null;
let credentials: OAuthPkceCredentialProvider | null = null;
let oauthConfig: OAuthPublicClientConfig | null = null;
let signupUrl = "";
let allowSelfRegistration = false;
let screen: Screen = "home";
let storefront: Row = {};
let products: Row[] = [];
let category = "";
let search = "";
let notice = "";
let account: Row | null = null;
let orderHistory: Row[] = [];
let quote: ShoppingQuote | null = null;
let selectedProduct: Row | null = null;
let selectedOrder: Row | null = null;
let cart = loadCart();
let placing = false;
let loading = "";
let sort = "Featured";
let searchTimer = 0;
let noticeTone: UiTone = "info";

const field = (row: Row, ...keys: string[]) => { for (const key of keys) if (row[key] !== undefined && row[key] !== null) return String(row[key]); return ""; };
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((row): row is Row => Boolean(row) && typeof row === "object") : [];
const money = (value: unknown, currency = field(storefront, "currency") || "PKR") => formatMoney(value, currency);
const image = (row: Row) => field(row, "image_url", "website_image", "image") || "";
const showNotice = (value: string, tone: UiTone = "info") => { notice=value; noticeTone=tone; };
const cartCount = () => cart.lines.reduce((total, line) => total + line.quantity, 0);
const friendlyStatuses:Record<string,string>={Draft:"Order received","To Deliver":"Preparing your order","To Deliver and Bill":"Preparing your order",Completed:"Completed",Cancelled:"Cancelled"};
const friendlyStatus = (value: string) => friendlyStatuses[value] || value || "Order received";
const statusTone = (value:string):UiTone => value==="Completed"?"success":value==="Cancelled"?"danger":/Deliver|Preparing/i.test(value)?"warning":"info";

function loadCart(): ShoppingCart {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as ShoppingCart | null;
    if (saved && Array.isArray(saved.lines)) return saved;
  } catch { /* discard corrupt local draft */ }
  return emptyCart();
}

function saveCart(next: ShoppingCart) {
  if (next.updatedAt !== cart.updatedAt) localStorage.removeItem(checkoutKey);
  cart = next;
  quote = null;
  localStorage.setItem(storageKey, JSON.stringify(cart));
}

async function body(response: Response): Promise<Row> {
  const value = await response.json().catch(() => ({})) as Row;
  if (!response.ok) throw new Error(field(value, "message", "exception") || `Server error ${response.status}`);
  return value.message && typeof value.message === "object" ? value.message as Row : value;
}

async function connect(url: string) {
  baseUrl = url.replace(/\/+$/, "");
  const platform = isNative ? "capacitor" : "web";
  const response = await globalThis.fetch(`${baseUrl}/api/method/aimatic.shopping.api.get_public_config`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, origin: isNative ? undefined : location.origin })
  });
  const config = await body(response);
  oauthConfig = { baseUrl, clientId: field(config, "oauth_client_id"), redirectUri: field(config, "redirect_uri"), scope: field(config, "scope") };
  signupUrl = field(config, "signup_url");
  allowSelfRegistration = config.allow_self_registration === true || config.allow_self_registration === 1;
  if (!oauthConfig.clientId || !oauthConfig.redirectUri) throw new Error("Customer OAuth is not configured.");
  credentials = new OAuthPkceCredentialProvider(async () => oauthConfig!, isNative ? androidSecureStorage : sessionSecureStorage, isNative ? capacitorOAuthBrowser : webOAuthBrowser, globalThis.fetch.bind(globalThis));
  api = createShoppingApi(createApiClient({ baseUrl, authentication: { mode: "customer-session", credentials }, fetch: globalThis.fetch.bind(globalThis) }));
}

function setup(error = "") {
  root.innerHTML = `<section class="setup"><div class="setup-card"><div class="logo">AM</div><h1>Ai Matic Shopping</h1><p>Connect to your store to start shopping.</p>${error ? `<p class="notice">${esc(error)}</p>` : ""}<form id="setup"><label>Store URL<input id="url" type="url" required value="${esc(baseUrl)}" placeholder="https://shop.example.com"></label><button class="primary">Open store</button></form><small>v${esc(__APP_VERSION__)}</small></div></section>`;
  document.querySelector<HTMLFormElement>("#setup")!.onsubmit = async (event) => {
    event.preventDefault();
    const url = document.querySelector<HTMLInputElement>("#url")!.value;
    try { await connect(url); await loadStore(); localStorage.setItem("aimatic-shopping-url", baseUrl); }
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
  return `<header><button class="wordmark" data-screen="home"><span>AM</span><strong>${esc(field(storefront, "store_name") || "Ai Matic")}</strong></button><button id="search-open" class="search-button"><span>⌕</span> Search products, brands and categories</button><div class="delivery-location"><small>${cart.branch?"Shopping from":"Choose location"}</small><b>${esc(cart.branch||"Select branch")}</b></div><div class="head-actions"><button data-screen="${account ? "account" : "login"}" aria-label="Account">${account ? "Account" : "Sign in"}</button><button class="cart-button" data-screen="cart" aria-label="Cart">Cart <b>${esc(cartCount())}</b></button></div></header>`;
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
  if (next === "order" && !selectedOrder) next = "orders";
  render(next);
}

function nav() {
  const active = screen === "catalog" || screen === "product" ? "categories" : screen === "checkout" ? "cart" : screen === "order" ? "orders" : screen === "login" || screen === "register" ? "account" : screen;
  return bottomNavigation("Shopping navigation",active as "home"|"categories"|"cart"|"orders"|"account",[
    {id:"home",label:"Home",icon:"⌂"},{id:"categories",label:"Categories",icon:"▦"},
    {id:"cart",label:"Cart",icon:"▤",badge:cartCount()},{id:"orders",label:"Orders",icon:"▣"},{id:"account",label:"Account",icon:"●"}
  ]);
}

function productCards(list: Row[]) {
  const sorted=[...list].sort((a,b)=>sort==="Price: Low"?(Number(a.rate||a.price)-Number(b.rate||b.price)):sort==="Price: High"?(Number(b.rate||b.price)-Number(a.rate||a.price)):0);
  return `<div class="product-grid">${sorted.map((product) => {
    const code = field(product, "item_code", "name");
    const src = image(product);
    const rate=Number(field(product,"rate","price"))||0,mrp=Number(field(product,"mrp","standard_rate"))||0,line=cart.lines.find((item)=>item.itemCode===code);
    return `<article class="product-card ${product.available===false?"unavailable":""}" data-product="${esc(code)}"><div class="product-image">${src ? `<img src="${esc(src)}" alt="${esc(field(product,"item_name","name"))}" loading="lazy">` : `<div class="image-fallback">${esc(field(product,"item_name","name").slice(0,2))}</div>`}${mrp>rate?'<span class="offer-badge">Offer</span>':""}</div><div class="product-copy"><small>${esc(field(product,"brand","category"))}</small><h3>${esc(field(product,"item_name","name"))}</h3><div class="product-price"><b>${money(rate)}</b>${mrp>rate?`<del>${money(mrp)}</del>`:""}</div><span class="availability ${product.available===false?"out":""}">${product.available===false?"Out of stock":"Available"}</span>${line?`<div class="quantity card-quantity"><button data-product-quantity="${esc(line.id)}" data-delta="-1" aria-label="Decrease quantity">−</button><b>${line.quantity}</b><button data-product-quantity="${esc(line.id)}" data-delta="1" aria-label="Increase quantity">+</button></div>`:`<button class="primary add" data-item="${esc(code)}" ${product.available===false?"disabled":""}>${product.available===false?"Unavailable":"Add to cart"}</button>`}</div></article>`;
  }).join("") || emptyState("⌕","No products found","Try another search, category or filter.")}</div>`;
}

function productView() {
  const product=selectedProduct||{};const src=image(product);
  const rate=Number(field(product,"rate","price"))||0,mrp=Number(field(product,"mrp","standard_rate"))||0;
  return `<section class="page"><button class="back-button" data-screen="catalog">‹ Back to products</button><article class="product-detail"><div class="detail-image">${src?`<img src="${esc(src)}" alt="${esc(field(product,"item_name","name"))}">`:`<div class="image-fallback">${esc(field(product,"item_name").slice(0,2))}</div>`}</div><div class="detail-copy"><p class="eyebrow">${esc(field(product,"brand")||"Ai Matic selection")}</p><h1>${esc(field(product,"item_name","name"))}</h1><div class="detail-price"><strong>${money(rate)}</strong>${mrp>rate?`<del>${money(mrp)}</del><span>Save ${money(mrp-rate)}</span>`:""}</div>${statusBadge(product.available===false?"Out of stock":"In stock",product.available===false?"danger":"success")}<p class="description">${esc(field(product,"description")||"Product details are provided by the store catalogue.")}</p><dl><div><dt>Category</dt><dd>${esc(field(product,"category","item_group")||"General")}</dd></div><div><dt>Brand</dt><dd>${esc(field(product,"brand")||"—")}</dd></div><div><dt>Item code</dt><dd>${esc(field(product,"item_code","name"))}</dd></div></dl><div class="fulfillment-note"><b>⌂ Pickup</b><span>Available from ${esc(cart.branch||"your selected branch")}</span></div><div class="detail-actions"><button class="primary add" data-item="${esc(field(product,"item_code","name"))}" ${product.available===false?"disabled":""}>Add to Cart</button><button id="buy-now" class="dark-action" data-item="${esc(field(product,"item_code","name"))}" ${product.available===false?"disabled":""}>Buy Now</button></div></div></article><section class="section"><div class="section-title"><h2>You may also like</h2></div>${productCards(products.filter((entry)=>field(entry,"item_code","name")!==field(product,"item_code","name")).slice(0,4))}</section></section>`;
}

function homeView() {
  const banners = rows(storefront.banners);
  const categories = rows(storefront.categories);
  return `<section class="page"><form id="home-search" class="home-search"><span>⌕</span><input id="home-query" type="search" placeholder="What are you looking for?" autocomplete="off"><button class="primary">Search</button></form><div class="location-strip"><span>⌂</span><div><small>Shopping location</small><b>${esc(cart.branch||field(storefront,"branch")||"Select your store")}</b></div><button data-screen="categories">Change</button></div><div class="hero compact">${image(banners[0] || {}) ? `<img src="${esc(image(banners[0]))}" alt="">` : ""}<div><p>SHOP SMARTER</p><h1>${esc(field(banners[0] || storefront,"title","headline") || "Everyday essentials, ready for you")}</h1><button class="light" data-screen="catalog">Shop now</button></div></div><section class="section"><div class="section-title"><h2>Shop by category</h2><button data-screen="categories">View all</button></div><div class="category-row">${categories.slice(0,8).map((item) => `<button class="category" data-category="${esc(field(item,"name","category"))}">${image(item) ? `<img src="${esc(image(item))}" alt="">` : '<span class="category-icon">▦</span>'}<strong>${esc(field(item,"label","name","category"))}</strong></button>`).join("") || "<p>Categories will appear here.</p>"}</div></section><section class="section"><div class="section-title"><div><p class="eyebrow">Customer favourites</p><h2>Popular now</h2></div><button data-screen="catalog">See all</button></div>${productCards(products.slice(0,4))}</section><section class="section"><div class="section-title"><div><p class="eyebrow">Fresh catalogue</p><h2>New arrivals</h2></div></div>${productCards(products.slice(4,8))}</section>${cart.lines.length?`<section class="reorder-strip"><div><p class="eyebrow">Continue shopping</p><h2>${cartCount()} items waiting in your cart</h2></div><button class="primary" data-screen="cart">View cart</button></section>`:""}</section>`;
}

function categoriesView(){
  const categories=rows(storefront.categories);
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">Browse</p><h1>Categories</h1><p>Find products quickly by department.</p></div></div><div class="category-grid">${categories.map((item)=>`<button class="category-card" data-category="${esc(field(item,"name","category"))}">${image(item)?`<img src="${esc(image(item))}" alt="">`:'<span>▦</span>'}<strong>${esc(field(item,"label","name","category"))}</strong><small>Browse products →</small></button>`).join("")||emptyState("▦","No categories yet","Use search to browse all available products.")}</div></section>`
}

function catalogView() {
  const categories = rows(storefront.categories);
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">Catalogue</p><h1>${search?`Results for “${esc(search)}”`:category?esc(category):"All products"}</h1><p>${products.length} products found</p></div><label class="sort-control">Sort<select id="sort"><option ${sort==="Featured"?"selected":""}>Featured</option><option ${sort==="Price: Low"?"selected":""}>Price: Low</option><option ${sort==="Price: High"?"selected":""}>Price: High</option></select></label></div><form id="search" class="search"><span>⌕</span><input id="query" value="${esc(search)}" placeholder="Search products, categories, brands" autocomplete="off"><button class="primary">Search</button></form><div class="chips"><button data-category="" class="${!category?"active":""}">All</button>${categories.map((item) => { const value=field(item,"name","category"); return `<button data-category="${esc(value)}" class="${value===category?"active":""}">${esc(field(item,"label","name","category"))}</button>`; }).join("")}</div>${productCards(products)}</section>`;
}

function cartView() {
  const subtotal=cartDisplaySubtotal(cart);
  return `<section class="page cart-page"><div class="page-heading"><div><p class="eyebrow">Shopping cart</p><h1>Your cart</h1><p>${cartCount()} items · Prices confirmed at checkout</p></div></div>${notice?`<div class="notice ${noticeTone}" role="status">${esc(notice)}</div>`:""}<div class="cart-layout"><div class="cart-lines">${cart.lines.map((line)=>{const quoted=quote?.lines.find((entry)=>entry.lineId===line.id);const changed=quoted&&quoted.rate!==line.displayedRate;return `<article class="cart-line ${quoted&&!quoted.available?"invalid":""}">${line.imageUrl?`<img src="${esc(line.imageUrl)}" alt="${esc(line.itemName)}">`:'<div class="thumb">AM</div>'}<div class="cart-copy"><h3>${esc(line.itemName)}</h3><small>${esc(line.itemCode)} · ${esc(line.uom)}</small>${line.modifiers.length?`<small>${esc(line.modifiers.map((modifier)=>modifier.value).join(" · "))}</small>`:""}<div class="unit-price"><b>${money(line.displayedRate)}</b>${changed?`<span class="price-warning">Price changed to ${money(quoted.rate)}</span>`:""}</div>${quoted&&!quoted.available?`<p class="stock-warning">! ${esc(quoted.message||"Currently unavailable")}</p>`:""}</div><div class="cart-actions"><div class="quantity"><button data-quantity="${esc(line.id)}" data-delta="-1" aria-label="Decrease ${esc(line.itemName)}">−</button><b>${esc(line.quantity)}</b><button data-quantity="${esc(line.id)}" data-delta="1" aria-label="Increase ${esc(line.itemName)}">+</button></div><strong>${money(line.displayedRate*line.quantity)}</strong><div><button class="text-action save-later" data-line="${esc(line.id)}">Save for later</button><button class="text-action remove-line" data-line="${esc(line.id)}">Remove</button></div></div></article>`}).join("")||emptyState("▤","Your cart is empty","Products you add will stay safely on this device.",{label:"Start shopping",attribute:'data-screen="catalog"'})}</div>${cart.lines.length?`<aside class="summary sticky-summary"><h2>Order summary</h2><p><span>Subtotal</span><strong>${money(quote?.subtotal??subtotal,quote?.currency)}</strong></p><p><span>Discount</span><strong>${quote?`− ${money(quote.discount,quote.currency)}`:"Calculated at checkout"}</strong></p><p><span>Delivery / pickup</span><strong>${quote?money(quote.deliveryCharge,quote.currency):"Select at checkout"}</strong></p><p><span>Tax</span><strong>${quote?money(quote.taxes,quote.currency):"Calculated at checkout"}</strong></p><p class="grand"><span>Total</span><strong>${money(quote?.grandTotal??subtotal,quote?.currency)}</strong></p><small>Quantities and prices never change silently. Review any server update before ordering.</small><button id="checkout" class="primary wide">Checkout securely</button><button data-screen="catalog" class="continue wide">Continue shopping</button></aside>`:""}</div></section>`;
}

function loginView() {
  return `<section class="page narrow"><div class="form-card"><h1>Customer sign in</h1><p>Sign in securely in the system browser to checkout and track orders.</p>${notice ? `<p class="notice">${esc(notice)}</p>` : ""}<button id="login" class="primary wide">Sign in</button>${signupUrl?`<button id="signup" class="wide">Create customer account</button>`:""}<small>No ERPNext API key, reports, or administrative access is included.</small></div></section>`;
}

function registerView() {
  return `<section class="page narrow"><div class="form-card"><h1>Finish your customer account</h1><p>Your secure login succeeded. Add your details to create a new shopping Customer.</p>${notice ? `<p class="notice">${esc(notice)}</p>` : ""}<form id="register-customer"><label>Full name<input id="customer-name" autocomplete="name" minlength="2" maxlength="140" required></label><label>Mobile number (optional)<input id="customer-mobile" type="tel" autocomplete="tel" maxlength="30"></label><button class="primary wide">Create customer account</button></form><small>Existing ERPNext customers are never linked automatically.</small></div></section>`;
}

function checkoutView() {
  const addresses = rows(account?.addresses);
  const delivery = rows(storefront.delivery_methods);
  const payments = rows(storefront.payment_methods);
  return `<section class="page checkout-page"><div class="page-heading"><div><button class="back-button" data-screen="cart">‹ Cart</button><p class="eyebrow">Secure checkout</p><h1>Complete your order</h1></div></div><div class="checkout-steps"><span class="complete"><b>1</b>Address</span><span class="active"><b>2</b>Delivery</span><span><b>3</b>Payment</span><span><b>4</b>Review</span><span><b>5</b>Done</span></div>${notice?`<div class="notice ${noticeTone}">${esc(notice)}</div>`:""}<div class="checkout-layout"><form id="place" class="form-card"><section><div class="form-heading"><span>1</span><div><h2>Address</h2><p>Choose a saved address or use pickup.</p></div></div>${addresses.length?`<label>Saved address<select id="address"><option value="">No address needed for pickup</option>${addresses.map((item)=>`<option value="${esc(field(item,"name"))}">${esc(field(item,"label","address_title","name"))}</option>`).join("")}</select></label>`:'<input id="address" type="hidden" value=""><p class="inline-info">No delivery address is available. Store Pickup remains available.</p>'}<button type="button" class="text-action" data-address-edit>Add or edit address in your account</button></section><section><div class="form-heading"><span>2</span><div><h2>Delivery or pickup</h2><p>Availability is confirmed for your selected branch.</p></div></div><label>Fulfillment<select id="delivery" required>${delivery.map((item)=>`<option value="${esc(field(item,"name"))}">${esc(field(item,"label","name"))}</option>`).join("")}</select></label><label>Delivery instructions<textarea id="instructions" rows="2" placeholder="Optional instructions for the store"></textarea></label></section><section><div class="form-heading"><span>3</span><div><h2>Payment</h2><p>Only currently supported methods are shown.</p></div></div><label>Payment method<select id="payment" required>${payments.map((item)=>`<option value="${esc(field(item,"name"))}">${esc(field(item,"label","name"))}</option>`).join("")}</select></label><p class="inline-info">Cash on Delivery / Pickup payment is collected according to the selected method.</p></section><button id="refresh-quote" type="button" class="secondary wide" ${placing?"disabled":""}>↻ Confirm stock and totals</button></form><aside class="summary checkout-summary"><h2>Review</h2><div class="mini-items">${cart.lines.map((line)=>`<div><span>${line.quantity}× ${esc(line.itemName)}</span><b>${money(line.quantity*line.displayedRate)}</b></div>`).join("")}</div>${quote?`<div class="totals"><p><span>Subtotal</span><b>${money(quote.subtotal,quote.currency)}</b></p><p><span>Discount</span><b>− ${money(quote.discount,quote.currency)}</b></p><p><span>Tax</span><b>${money(quote.taxes,quote.currency)}</b></p><p><span>Fulfillment</span><b>${money(quote.deliveryCharge,quote.currency)}</b></p><p class="grand"><span>Total</span><b>${money(quote.grandTotal,quote.currency)}</b></p></div><button form="place" class="primary wide" ${placing?"disabled":""}>${placing?"Placing order safely…":"Place order"}</button><small>A stable request ID prevents duplicate submission.</small>`:'<div class="quote-prompt"><span>↻</span><p>Confirm totals to validate current prices and availability before placing the order.</p></div>'}</aside></div></section>`;
}

function ordersView() {
  return `<section class="page orders-page"><div class="page-heading"><div><p class="eyebrow">Your purchases</p><h1>Orders</h1><p>Track pickup and delivery progress in customer-friendly terms.</p></div><button data-screen="catalog">Shop again</button></div>${notice?`<div class="notice ${noticeTone}">${esc(notice)}</div>`:""}<div class="order-list">${orderHistory.map((order)=>{const raw=field(order,"delivery_status","status"),friendly=friendlyStatus(raw);return `<button class="order-card" data-order="${esc(field(order,"name","order"))}"><div><span class="order-icon">▣</span><span><strong>${esc(field(order,"name","order"))}</strong><small>${esc(field(order,"transaction_date","creation","date"))}</small><small>${esc(field(order,"item_summary")||"Tap to view order details")}</small></span></div><div>${statusBadge(friendly,statusTone(raw))}<b>${money(field(order,"grand_total"),field(order,"currency")||undefined)}</b><small>${esc(field(order,"delivery_method")||"Store Pickup / Delivery")}</small></div><span>View →</span></button>`}).join("")||emptyState("▣","No orders yet","Completed checkouts and their tracking status appear here.",{label:"Start shopping",attribute:'data-screen="catalog"'})}</div></section>`;
}

function orderView(){
  const order=selectedOrder||{};const raw=field(order,"delivery_status","status"),friendly=friendlyStatus(raw);
  const steps=["Order received","Confirmed","Preparing","Ready for pickup","Completed"];
  const active=raw==="Completed"?4:/Deliver|Preparing/i.test(raw)?2:1;
  return `<section class="page order-detail-page"><button class="back-button" data-screen="orders">‹ All orders</button><div class="order-detail-head"><div><p class="eyebrow">Order tracking</p><h1>${esc(field(order,"name","order"))}</h1><p>Placed ${esc(field(order,"transaction_date","creation","date"))}</p></div>${statusBadge(friendly,statusTone(raw))}</div><div class="tracking-card"><div class="tracking-timeline">${steps.map((step,index)=>`<div class="${index<active?"complete":index===active?"active":""}"><span>${index<active?"✓":index+1}</span><div><b>${step}</b><small>${index<=active?"Status updated":"Waiting"}</small></div></div>`).join("")}</div><div class="tracking-summary"><h2>Order summary</h2><p><span>Fulfillment</span><b>${esc(field(order,"delivery_method")||"Store Pickup")}</b></p><p><span>Items</span><b>${esc(field(order,"item_summary","total_qty")||"Order items")}</b></p><p class="grand"><span>Total</span><b>${money(field(order,"grand_total"),field(order,"currency")||undefined)}</b></p><button id="reorder" class="primary wide">Reorder available items</button></div></div></section>`
}

function accountView(){
  if(!account)return loginView();
  return `<section class="page account-page"><div class="account-hero"><span>${esc(field(account,"customer_name","full_name","name").slice(0,2).toUpperCase())}</span><div><p class="eyebrow">Customer account</p><h1>${esc(field(account,"customer_name","full_name","name"))}</h1><p>${esc(field(account,"email","user"))}</p></div></div><div class="account-grid"><section><h2>Shopping</h2><button data-screen="orders"><span>Order history</span><b>Track orders →</b></button><button data-screen="cart"><span>Saved cart</span><b>${cartCount()} items →</b></button><button data-screen="categories"><span>Categories</span><b>Browse →</b></button></section><section><h2>Delivery details</h2><p>${rows(account.addresses).length} saved address${rows(account.addresses).length===1?"":"es"}</p><p>Address editing remains managed by your secure customer account.</p><button id="logout" class="secondary wide">Sign out securely</button></section></div></section>`
}

function render(next: Screen = screen) {
  screen = next;
  const content = loading ? `<section class="page loading-page">${loadingSkeleton(5)}<p>${esc(loading)}</p></section>`
    : screen === "home" ? homeView() : screen === "categories" ? categoriesView() : screen === "catalog" ? catalogView()
    : screen === "product" ? productView() : screen === "cart" ? cartView() : screen === "login" ? loginView()
    : screen === "register" ? registerView() : screen === "checkout" ? checkoutView() : screen === "orders" ? ordersView()
    : screen === "order" ? orderView() : accountView();
  root.innerHTML = `${header()}${content}${nav()}`;
  bind();
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => button.onclick = () => void openScreen(button.dataset.screen as Screen));
  document.querySelector<HTMLButtonElement>("#search-open")!.onclick = () => render("catalog");
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => button.onclick = async () => { category=button.dataset.category || "";loading="Loading products";render();await loadProducts();loading="";render("catalog"); });
  document.querySelectorAll<HTMLButtonElement>(".add").forEach((button) => button.onclick = () => {
    const product = products.find((item)=>field(item,"item_code","name")===button.dataset.item) || selectedProduct;
    if (!product) return;
    saveCart(addCartLine(cart,{itemCode:field(product,"item_code","name"),itemName:field(product,"item_name","name"),imageUrl:image(product)||null,uom:field(product,"uom","stock_uom")||"Nos",displayedRate:Number(field(product,"rate","price"))||0,modifiers:[]}));
    showNotice("Added to cart.","success"); render(screen);
  });
  document.querySelectorAll<HTMLElement>("[data-product]").forEach(card=>card.onclick=async(event)=>{if((event.target as HTMLElement).closest(".add"))return;try{selectedProduct=await body(await api!.getProduct(card.dataset.product!,cart.branch||undefined));render("product");}catch(error){notice=error instanceof Error?error.message:"Unable to load product";render("catalog")}});
  const submitSearch=async(query:string)=>{search=query;loading="Searching the catalogue";render();try{await loadProducts();showNotice(products.length?`${products.length} products found`:"No matching products",products.length?"info":"warning")}catch(error){showNotice(error instanceof Error?error.message:"Search failed","danger")}finally{loading="";render("catalog")}};
  document.querySelector<HTMLFormElement>("#search")?.addEventListener("submit",(event)=>{event.preventDefault();void submitSearch(document.querySelector<HTMLInputElement>("#query")!.value)});
  document.querySelector<HTMLFormElement>("#home-search")?.addEventListener("submit",(event)=>{event.preventDefault();void submitSearch(document.querySelector<HTMLInputElement>("#home-query")!.value)});
  document.querySelector<HTMLInputElement>("#query")?.addEventListener("input",(event)=>{window.clearTimeout(searchTimer);const value=(event.target as HTMLInputElement).value;if(value.length>=2)searchTimer=window.setTimeout(()=>void submitSearch(value),400)});
  document.querySelector<HTMLSelectElement>("#sort")?.addEventListener("change",(event)=>{sort=(event.target as HTMLSelectElement).value;render("catalog")});
  document.querySelectorAll<HTMLButtonElement>("[data-quantity]").forEach((button)=>button.onclick=()=>{const line=cart.lines.find((item)=>item.id===button.dataset.quantity)!;saveCart(setCartQuantity(cart,line.id,line.quantity+Number(button.dataset.delta)));render("cart");});
  document.querySelectorAll<HTMLButtonElement>("[data-product-quantity]").forEach((button)=>button.onclick=(event)=>{event.stopPropagation();const line=cart.lines.find((item)=>item.id===button.dataset.productQuantity)!;saveCart(setCartQuantity(cart,line.id,line.quantity+Number(button.dataset.delta)));render(screen)});
  document.querySelectorAll<HTMLButtonElement>(".remove-line").forEach((button)=>button.onclick=()=>{if(!confirm("Remove this item from your cart?"))return;saveCart(setCartQuantity(cart,button.dataset.line!,0));showNotice("Item removed from cart.","success");render("cart")});
  document.querySelectorAll<HTMLButtonElement>(".save-later").forEach((button)=>button.onclick=()=>{showNotice("Save for later needs a customer wishlist API. The item remains in your cart.","info");render("cart")});
  document.querySelector<HTMLButtonElement>("#buy-now")?.addEventListener("click",()=>{const product=selectedProduct;if(!product)return;saveCart(addCartLine(cart,{itemCode:field(product,"item_code","name"),itemName:field(product,"item_name","name"),imageUrl:image(product)||null,uom:field(product,"uom","stock_uom")||"Nos",displayedRate:Number(field(product,"rate","price"))||0,modifiers:[]}));render(account?"checkout":"login")});
  document.querySelector<HTMLButtonElement>("#checkout")?.addEventListener("click",()=>{notice="";render(account?"checkout":"login");});
  document.querySelector<HTMLButtonElement>("#login")?.addEventListener("click",async()=>{try{await credentials!.login();try{account=await body(await api!.getAccount());notice="";render("checkout");}catch(error){notice=error instanceof Error?error.message:"Customer account is not ready";render(allowSelfRegistration?"register":"login");}}catch(error){notice=error instanceof Error?error.message:"Sign in failed";render("login");}});
  document.querySelector<HTMLFormElement>("#register-customer")?.addEventListener("submit",async(event)=>{event.preventDefault();try{await body(await api!.registerCustomer(document.querySelector<HTMLInputElement>("#customer-name")!.value,document.querySelector<HTMLInputElement>("#customer-mobile")!.value));account=await body(await api!.getAccount());notice="Customer account created.";render("checkout");}catch(error){notice=error instanceof Error?error.message:"Unable to create customer account";render("register");}});
  document.querySelector<HTMLButtonElement>("#signup")?.addEventListener("click",()=>{if(isNative)void Browser.open({url:signupUrl});else globalThis.open(signupUrl,"_blank","noopener");});
  document.querySelector<HTMLButtonElement>("#refresh-quote")?.addEventListener("click",()=>void refreshQuote());
  document.querySelector<HTMLFormElement>("#place")?.addEventListener("submit",(event)=>void placeOrder(event));
  document.querySelectorAll<HTMLButtonElement>("[data-order]").forEach((button)=>button.onclick=()=>{selectedOrder=orderHistory.find((order)=>field(order,"name","order")===button.dataset.order)||null;render("order")});
  document.querySelector<HTMLButtonElement>("#reorder")?.addEventListener("click",()=>{showNotice("Reorder is ready for item-detail data from the Shopping order API.","info");render("order")});
  document.querySelector<HTMLElement>("[data-address-edit]")?.addEventListener("click",()=>{showNotice("Address editing remains in the secure customer account until a dedicated Shopping address API is available.","info");render("checkout")});
  document.querySelector<HTMLButtonElement>("#logout")?.addEventListener("click",async()=>{await credentials!.clear();account=null;notice="Signed out.";render("home");});
}

async function refreshQuote() {
  try {
    const address=document.querySelector<HTMLInputElement|HTMLSelectElement>("#address")!.value;
    const delivery=document.querySelector<HTMLSelectElement>("#delivery")!.value;
    quote=await body(await api!.quoteCart(cart,delivery,address)) as unknown as ShoppingQuote;
    showNotice("Prices, stock and totals confirmed.","success"); render("checkout");
  } catch(error) { showNotice(error instanceof Error?error.message:"Unable to refresh totals","danger");render("checkout"); }
}

async function placeOrder(event: SubmitEvent) {
  event.preventDefault();
  if(!quote||placing)return refreshQuote();
  try {
    const saved=JSON.parse(localStorage.getItem(checkoutKey)||"null") as ShoppingCheckoutAttempt|null;
    const attempt=ensureCheckoutAttempt(cart,saved,()=>crypto.randomUUID());
    localStorage.setItem(checkoutKey,JSON.stringify(attempt));
    const input={requestId:attempt.requestId,quoteToken:quote.quoteToken,addressName:document.querySelector<HTMLInputElement|HTMLSelectElement>("#address")!.value,deliveryMethod:document.querySelector<HTMLSelectElement>("#delivery")!.value,paymentMethod:document.querySelector<HTMLSelectElement>("#payment")!.value};
    assertCheckoutReady(cart,quote,input);
    placing=true;render("checkout");
    const result=await body(await api!.placeOrder(input)); placing=false;
    localStorage.removeItem(checkoutKey); saveCart(emptyCart()); quote=null; showNotice(`Order ${field(result,"sales_order","order","name")} placed successfully.`,"success");
    account=await body(await api!.getAccount()); await openScreen("orders");
  } catch(error) { placing=false;showNotice(error instanceof Error?error.message:"Order could not be placed","danger");render("checkout"); }
}

if (isOAuthCallback) root.innerHTML = `<section class="setup"><div class="setup-card"><h1>Completing sign in…</h1></div></section>`;
else if (baseUrl) { void connect(baseUrl).then(loadStore).catch((error)=>setup(error instanceof Error?error.message:"Store unavailable")); }
else setup();

if (!isNative && "serviceWorker" in navigator) void navigator.serviceWorker.register("./service-worker.js").catch(() => undefined);
