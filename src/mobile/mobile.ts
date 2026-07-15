import { createPosCore, asRecord, textValue, unwrapFrappePayload, formatResponseError } from "../core";
import { mobileDatabase as db } from "./browser-database";
import { createPlatformService } from "../platform/platform-service";
import type { ProductId } from "../config/product-profile";
import { authFetch } from "../core/auth-fetch";
import { androidSecureStorage } from "./secure-storage";
import { capacitorOAuthBrowser } from "./capacitor-oauth-browser";
import { OAuthPkceCredentialProvider } from "./credential-provider";
import { DeviceEnrollmentService } from "./device-enrollment";
import { scanEnrollmentQr } from "./enrollment-qr-scanner";
import { scanItemBarcode } from "./item-barcode-scanner";

declare const __APP_VERSION__: string;
declare const __APP_PRODUCT__: ProductId;

const platformFetch = globalThis.fetch.bind(globalThis);
const enrollmentService = new DeviceEnrollmentService(androidSecureStorage, db, platformFetch);
const credentials = new OAuthPkceCredentialProvider(() => enrollmentService.oauthConfig(), androidSecureStorage, capacitorOAuthBrowser, platformFetch);
const coreDeps = { db, fetch: platformFetch, credentials };
const core = createPosCore(coreDeps);
const runtimeInfo = createPlatformService("capacitor", __APP_PRODUCT__);
const catalogListeners: Array<(message: string) => void> = [];
const completeSaleListeners: Array<() => void> = [];
const focusListeners: Array<() => void> = [];
const updateListeners: Array<(payload: Record<string, unknown>) => void> = [];
let pendingAdminAuthorization: { token: string; action: string; cashierUser: string; expiresAt: number } | null = null;

function settings() { return db.loadSettings(); }
function baseUrl(): string { return new URL(settings().erpnextUrl).toString().replace(/\/+$/, ""); }
function remembered(): string[] { try{return JSON.parse(db.getMeta("mobile_cashiers")||"[]") as string[];}catch{return[];} }
function remember(user:string): void { const all=[user,...remembered().filter(x=>x!==user)].slice(0,10);db.setMeta("mobile_cashiers",JSON.stringify(all)); }
function cashierKey(user:string): string { return `mobile_cashier_${settings().terminalId.toLowerCase()}_${settings().posProfile.toLowerCase()}_${user.trim().toLowerCase()}`; }
async function pinHash(pin:string): Promise<string> { const data=new TextEncoder().encode(`${cashierKey("")}|${pin}`);const digest=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join(""); }

const emptyLogin = () => ({success:false,user:"",fullName:"",roles:[] as string[],allowedPosProfiles:[] as string[],defaultPosProfile:"",canStartShift:false,canRefund:false,canCloseShift:false,canOfflineSale:false,offlineLoginExpiresAt:"",requirePinSetup:false,error:null as string|null});

async function cashierLogin(input:Record<string,unknown>) {
  const pin=textValue(input,"offlinePin"),confirm=textValue(input,"offlinePinConfirm");
  try{
    if(!await credentials.getAccessToken())await credentials.login();
    const hardwareId=db.getOrCreateHardwareId();
    const response=await authFetch(coreDeps,`${baseUrl()}/api/method/aimatic.offline_pos.api.get_cashier_context`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({hardware_id:hardwareId,pos_profile:settings().posProfile})});
    const rawBody=await response.text();let parsed:Record<string,unknown>={};try{parsed=JSON.parse(rawBody) as Record<string,unknown>;}catch{/* handled below */}
    const payload=unwrapFrappePayload(parsed);if(!response.ok)return{...emptyLogin(),error:formatResponseError(response.status,response.statusText,rawBody)};
    if(payload.success===false)return{...emptyLogin(),error:textValue(payload,"error")||"Cashier login failed."};
    const user=(textValue(payload,"user")||textValue(payload,"email")).toLowerCase();const canOfflineSale=payload.can_offline_sale===true;const cached=db.getMeta(cashierKey(user));
    if(canOfflineSale&&!cached&&!pin)return{...emptyLogin(),requirePinSetup:true,error:"Create and confirm Offline Cashier PIN to enable offline selling for this cashier."};
    if(pin!==confirm)return{...emptyLogin(),requirePinSetup:true,error:"Offline Cashier PIN confirmation does not match."};
    const result={success:true,user,fullName:textValue(payload,"full_name")||user,roles:Array.isArray(payload.roles)?payload.roles.map(String):[],allowedPosProfiles:Array.isArray(payload.allowed_pos_profiles)?payload.allowed_pos_profiles.map(String):[],defaultPosProfile:textValue(payload,"default_pos_profile"),canStartShift:Boolean(payload.can_start_shift),canRefund:Boolean(payload.can_refund),canCloseShift:Boolean(payload.can_close_shift),canOfflineSale,offlineLoginExpiresAt:textValue(payload,"offline_login_expires_at"),requirePinSetup:false,error:null as string|null,offlineCached:Boolean(cached||pin)};
    if(pin&&!/^\d{4,8}$/.test(pin))return{...emptyLogin(),requirePinSetup:true,error:"Offline PIN must contain 4 to 8 digits."};
    if(pin)db.setMeta(cashierKey(user),JSON.stringify({result,pinHash:await pinHash(pin),expiresAt:result.offlineLoginExpiresAt}));remember(user);return result;
  }catch(error){return{...emptyLogin(),error:`Cashier login failed: ${error instanceof Error?error.message:"network error"}`};}
}

async function cashierOfflineLogin(input:Record<string,unknown>) {
  const user=textValue(input,"username").trim().toLowerCase(),pin=textValue(input,"pin");let cached:Record<string,unknown>|null=null;try{cached=asRecord(JSON.parse(db.getMeta(cashierKey(user))||"null"));}catch{/* corrupted */}
  if(!cached||await pinHash(pin)!==textValue(cached,"pinHash"))return{...emptyLogin(),error:"Offline cashier username or PIN is incorrect."};
  const result=asRecord(cached.result)??{};const expires=textValue(cached,"expiresAt");if(expires&&new Date(expires).getTime()<Date.now())return{...emptyLogin(),error:"Offline cashier access has expired. Sign in online again."};
  return{...emptyLogin(),...result,success:true,offlineLogin:true,error:null};
}

async function authorizeAdminAction(input:Record<string,unknown>) {
  try{const response=await authFetch(coreDeps,`${baseUrl()}/api/method/aimatic.offline_pos.api.authorize_pos_admin_action`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:textValue(input,"username"),password:textValue(input,"password"),action:textValue(input,"action"),terminal_id:settings().terminalId})});const raw=await response.text();let body:Record<string,unknown>={};try{body=JSON.parse(raw) as Record<string,unknown>;}catch{}const payload=unwrapFrappePayload(body);const token=textValue(payload,"token");if(response.ok&&token){pendingAdminAuthorization={token,action:textValue(input,"action"),cashierUser:textValue(input,"cashierUser").toLowerCase(),expiresAt:Date.now()+5*60_000};return{ok:true,token,error:null};}return{ok:false,token:"",error:textValue(payload,"error")||formatResponseError(response.status,response.statusText,raw)};}catch(e){return{ok:false,token:"",error:e instanceof Error?e.message:"Authorization failed."};}
}

const posAPI = {
  getRuntimeInfo: async()=>runtimeInfo,
  getDatabaseStatus: async()=>db.getDatabaseStatus(), focusPosWindow:async()=>true, onFocusScanner:(cb:()=>void)=>focusListeners.push(cb),
  saveSettings:async(s:Parameters<typeof db.saveSettings>[0])=>db.saveSettings(s),loadSettings:async()=>db.getSettingsForRenderer(),listPrinters:async()=>[{name:"android",displayName:"Android Print Service"}],
  testServer:()=>core.testServerReachability(),testLogin:()=>core.testApiAuthentication(),cashierLogin,cashierOfflineLogin,getRememberedCashiers:async()=>remembered(),
  loadPosProfiles:()=>core.loadAvailablePosProfiles(),loadPosProfile:()=>core.loadPosProfile(),getPosProfileCacheStatus:async()=>db.getPosProfileCacheStatus(),
  syncPosConfiguration:()=>core.syncPosConfiguration(),getCachedPosConfiguration:async()=>core.getCachedPosConfiguration(),syncPosSession:(input?:Record<string,unknown>)=>core.syncPosSession(input),getCachedPosSession:async()=>core.getCachedSessionSummary(),
  syncItemCatalog:(mode?:"auto"|"full")=>core.syncItemCatalog(m=>catalogListeners.forEach(cb=>cb(m)),mode),getCatalogTotals:async()=>db.getCatalogTotals(),syncFbrConfig:(mode?:"auto"|"full")=>core.syncFbrConfig(mode),getFbrSyncState:async()=>db.getFbrSyncState(),
  searchCatalog:async(q:string)=>db.searchCatalog(q,textValue(asRecord(db.getPosBootstrap(settings().posProfile)?.pos_profile),"warehouse")),onCatalogProgress:(cb:(m:string)=>void)=>catalogListeners.push(cb),lookupCatalog:async(q:string)=>db.lookupCatalog(q,textValue(asRecord(db.getPosBootstrap(settings().posProfile)?.pos_profile),"warehouse")),
  loadCart:async()=>{const x=core.getCartIdentity();return db.loadCartState(x.hardwareId,x.openingEntry);},saveCart:async(lines:unknown[])=>{const x=core.getCartIdentity();db.saveCartState(x.hardwareId,x.openingEntry,lines);},
  syncCustomers:(mode?:"auto"|"full")=>core.syncCustomers(mode),getCustomerSyncState:async()=>db.getCustomerSyncState(),searchCustomers:async(q:string)=>db.searchCustomers(q),loadCustomer:(name:string)=>core.loadCustomer(name),getCustomerCreationOptions:()=>core.getCustomerCreationOptions(),createCustomer:(x:Record<string,unknown>)=>core.createCustomer(x),
  previewCart:(x:Record<string,unknown>)=>core.previewCart(x),previewFbr:async(x:Record<string,unknown>)=>core.calculateFbrCart(x),getPaymentMethods:async()=>core.getPaymentMethods(),
  loadPaymentDraft:async()=>{const x=core.getCartIdentity();return db.loadPaymentDraft(`${x.hardwareId}::${x.openingEntry}`);},savePaymentDraft:async(p:unknown[])=>{const x=core.getCartIdentity();db.savePaymentDraft(`${x.hardwareId}::${x.openingEntry}`,p);},
  loadBenefitsDraft:async()=>{const x=core.getCartIdentity();return db.loadBenefitsDraft(`${x.hardwareId}::${x.openingEntry}`);},saveBenefitsDraft:async(b:Record<string,unknown>)=>{const x=core.getCartIdentity();db.saveBenefitsDraft(`${x.hardwareId}::${x.openingEntry}`,b);},
  getCustomerBenefits:(x:string)=>core.getCustomerBenefits(x),validateCoupon:(x:string)=>core.validateCoupon(x),listCustomerGiftVouchers:(x:string)=>core.listCustomerGiftVouchers(x),validateGiftVoucherCode:(x:string,c:string)=>core.validateGiftVoucherCode(x,c),
  getTerminalInvoiceId:async()=>core.getTerminalInvoiceId(),submitSale:(x:Record<string,unknown>)=>core.submitOnlineSale(x),queueSale:(x:Record<string,unknown>)=>core.queueSale(x),syncSaleQueue:()=>core.syncSaleQueue(),getQueueStatus:async()=>db.getQueueCounts(),onCompleteSaleShortcut:(cb:()=>void)=>completeSaleListeners.push(cb),
  getActivePosSession:(x?:Record<string,unknown>)=>core.getActivePosSession(x),startPosSession:(x:Record<string,unknown>)=>core.startPosSession(x),getReceipt:(x:string)=>core.getPosReceipt(x),getDuplicateReceipt:(x:string)=>core.getDuplicateReceipt(x),
  printReceipt:async(html:string)=>{const bridge=(globalThis as unknown as {AndroidPrint?:{printHtml(x:string):void}}).AndroidPrint;if(!html.trim())return{success:false,error:"No receipt content to print."};if(bridge)bridge.printHtml(html);else window.print();return{success:true,error:null};},
  holdSale:async(x:Record<string,unknown>)=>db.holdSale(core.toHeldInput(x)),listHeldSales:async()=>db.listHeldSales(),getHeldSale:async(id:number)=>db.getHeldSale(id),deleteHeldSale:async(id:number)=>db.deleteHeldSale(id),renameHeldSale:async(id:number,n:string)=>db.renameHeldSale(id,n),
  listSalesHistory:async(x:Record<string,unknown>)=>db.listSalesHistory(core.toHistoryFilter(x)),getSaleHistory:async(id:string)=>db.getSaleHistory(id),recordReprint:async(id:string)=>db.recordReprint(id),setSaleStatus:async(id:string,s:string)=>db.setSaleHistoryStatus(id,s),
  getInvoiceForRefund:(x:string)=>core.getInvoiceForRefund(x),submitPosRefund:(x:Record<string,unknown>)=>core.submitPosRefund(x),getShiftSummary:(x?:Record<string,unknown>)=>core.getShiftSummary(x),closeShift:(x:Record<string,unknown>)=>core.closeShift(x),listShiftHistory:async()=>core.getShiftHistoryList(),getShiftHistory:async(x:string)=>db.getShiftHistory(x),
  getAppVersion:async()=>`${__APP_VERSION__} Android`,checkForUpdate:async()=>({ok:false,error:"Install Android updates using a new APK."}),downloadUpdate:async()=>({ok:false,error:"Not available on Android."}),installUpdate:async()=>{},saveUpdateToken:async()=>({ok:false}),isUpdateTokenSet:async()=>false,onUpdateStatus:(cb:(p:Record<string,unknown>)=>void)=>updateListeners.push(cb),listReleases:async()=>({releases:[],error:"Windows releases are not applicable on Android."}),installRelease:async()=>({ok:false,error:"Windows installers cannot run on Android."}),
  authorizeAdminAction,resetCashierOfflinePin:async(x:Record<string,unknown>)=>{const user=textValue(x,"cashierUser").toLowerCase(),pin=textValue(x,"pin"),pending=pendingAdminAuthorization;pendingAdminAuthorization=null;if(!pending||pending.expiresAt<Date.now()||pending.action!=="reset_pin"||pending.cashierUser!==user||pending.token!==textValue(x,"token"))return{ok:false,error:"Supervisor authorization is missing, invalid, or expired."};if(!/^\d{4,8}$/.test(pin))return{ok:false,error:"Offline PIN must contain 4 to 8 digits."};if(pin!==textValue(x,"confirmPin"))return{ok:false,error:"PIN confirmation does not match."};let cached:Record<string,unknown>|null=null;try{cached=asRecord(JSON.parse(db.getMeta(cashierKey(user))||"null"));}catch{}if(!cached)return{ok:false,error:"No offline PIN is cached for this cashier."};cached.pinHash=await pinHash(pin);db.setMeta(cashierKey(user),JSON.stringify(cached));return{ok:true,error:null};},
  pushCustomerDisplay:(_x:Record<string,unknown>)=>{},previewCustomerDisplay:async()=>"no-second-display" as const
};

(window as unknown as {posAPI:typeof posAPI}).posAPI=posAPI;
document.documentElement.classList.add("android-app");
document.documentElement.dataset.platform=runtimeInfo.platform;
document.documentElement.dataset.product=runtimeInfo.product;

function removeTerminalCredentialUi(): void {
  document.querySelectorAll<HTMLElement>("[data-terminal-credentials]").forEach((element) => element.remove());
  for (const selector of ["#api-key", "#api-secret", "#quick-connect-api-key", "#quick-connect-api-secret"]) {
    document.querySelector<HTMLElement>(selector)?.closest("label")?.remove();
  }
  // Keep the hidden input because shared renderer setup/header code reads it,
  // but never ask Android users for a desktop Terminal ID. Device enrollment
  // owns the device identity and POS Profile assignment.
  const terminalLabel = document.querySelector<HTMLInputElement>("#terminal-id")?.closest("label");
  if (terminalLabel) terminalLabel.hidden = true;
  const quickDescription = document.querySelector<HTMLElement>("#quick-connect-form .card-meta");
  if (quickDescription) quickDescription.textContent = "Android devices connect through one-time enrollment and per-cashier ERPNext sign-in.";
  const quickButton = document.querySelector<HTMLButtonElement>("#cashier-login-quick-connect");
  if (quickButton) quickButton.hidden = true;
  const username = document.querySelector<HTMLInputElement>("#cashier-username")?.closest("label");
  const password = document.querySelector<HTMLInputElement>("#cashier-password")?.closest("label");
  if (username) username.classList.add("android-online-credential");
  if (password) password.classList.add("android-online-credential");
  const submit = document.querySelector<HTMLButtonElement>("#cashier-login-submit");
  if (submit) submit.textContent = "Sign in with ERPNext";
}

function bindAndroidPosUx(): void {
  const posScreen=document.querySelector<HTMLElement>("#pos-screen");
  const products=document.querySelector<HTMLButtonElement>("#mobile-show-products");
  const cart=document.querySelector<HTMLButtonElement>("#mobile-show-cart");
  const show=(view:"products"|"cart")=>{
    if(!posScreen)return;
    posScreen.dataset.mobileView=view;
    products?.toggleAttribute("aria-current",view==="products");
    cart?.toggleAttribute("aria-current",view==="cart");
    if(view==="products")window.setTimeout(()=>document.querySelector<HTMLInputElement>("#cart-search")?.focus(),0);
  };
  products?.addEventListener("click",()=>show("products"));
  cart?.addEventListener("click",()=>show("cart"));
  document.querySelector<HTMLButtonElement>("#mobile-cart-dock")?.addEventListener("click",()=>show("cart"));
  document.querySelector<HTMLButtonElement>("#mobile-scan-item")?.addEventListener("click",async(event)=>{
    const button=event.currentTarget as HTMLButtonElement;
    button.disabled=true;button.textContent="Scanning…";
    try{
      const value=await scanItemBarcode();
      const input=document.querySelector<HTMLInputElement>("#cart-search");
      if(input){show("products");input.value=value;input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));}
    }catch(error){
      const message=document.querySelector<HTMLElement>("#cart-message");
      if(message)message.textContent=error instanceof Error?error.message:"Barcode scan failed.";
    }finally{button.disabled=false;button.textContent="▣ Scan";}
  });
  show("products");
}

function enrollmentScreen(error = ""): void {
  document.querySelector<HTMLElement>(".app-shell")?.setAttribute("hidden", "");
  let screen = document.querySelector<HTMLElement>("#device-enrollment-screen");
  if (!screen) {
    screen = document.createElement("section");
    screen.id = "device-enrollment-screen";
    screen.className = "device-enrollment-screen";
    document.body.append(screen);
  }
  screen.innerHTML = `<div class="device-enrollment-card"><p class="eyebrow">Secure Android setup</p><h1>Enroll this POS device</h1><p>A supervisor generates a one-time Device Enrollment QR in ERPNext. Scan it directly with this device's camera. Manual paste remains available if the camera cannot be used.</p>${error?`<p class="settings-message">${error.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!))}</p>`:""}<form id="device-enrollment-form"><button id="scan-enrollment-qr" class="primary-action" type="button">Scan enrollment QR</button><label>Manual enrollment QR value<textarea id="device-enrollment-value" rows="5" autocomplete="off" required></textarea></label><button id="redeem-enrollment-value" class="secondary-button" type="submit">Enroll using pasted value</button></form><small>No API key or API secret is stored in this APK.</small></div>`;
  const redeem = async (value: string, button: HTMLButtonElement): Promise<void> => {
    button.disabled = true;
    button.textContent = "Enrolling…";
    try { await enrollmentService.redeem(value); location.reload(); }
    catch (cause) { enrollmentScreen(cause instanceof Error ? cause.message : "Enrollment failed"); }
  };
  document.querySelector<HTMLButtonElement>("#scan-enrollment-qr")!.onclick = async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Opening camera…";
    try {
      const value = await scanEnrollmentQr();
      const textarea = document.querySelector<HTMLTextAreaElement>("#device-enrollment-value")!;
      textarea.value = value;
      await redeem(value, button);
    } catch (cause) {
      enrollmentScreen(cause instanceof Error ? cause.message : "Unable to scan enrollment QR.");
    }
  };
  document.querySelector<HTMLFormElement>("#device-enrollment-form")!.onsubmit = async (event) => {
    event.preventDefault();
    const value = document.querySelector<HTMLTextAreaElement>("#device-enrollment-value")!.value;
    await redeem(value, document.querySelector<HTMLButtonElement>("#redeem-enrollment-value")!);
  };
}

async function startAndroidRenderer(): Promise<void> {
  try {
    if (!await enrollmentService.load()) { enrollmentScreen(); return; }
  } catch (error) {
    enrollmentScreen(error instanceof Error ? error.message : "Secure storage is unavailable.");
    return;
  }
  removeTerminalCredentialUi();
  const renderer = document.createElement("script");
  renderer.src = "renderer.js";
  renderer.addEventListener("load",bindAndroidPosUx,{once:true});
  document.body.append(renderer);
}

void startAndroidRenderer();
