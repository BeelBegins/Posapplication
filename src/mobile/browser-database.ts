import type { IDatabaseService } from "../db/IDatabaseService";
import type {
  AppSettings, CatalogSearchResult, CatalogTotals, HeldSaleDetail, HeldSaleInput,
  HeldSaleSummary, QueuedSale, RendererSettings, SalesHistoryFilter, SalesHistoryRow,
  ShiftHistoryInput, ShiftHistoryRow
} from "../db/database";

type Row = Record<string, unknown>;

interface MobileStore {
  meta: Record<string, string>;
  settings: Partial<AppSettings>;
  fbr: Record<string, Row>;
  fbrState: { serviceFee: number; lastSynced: string | null };
  held: HeldSaleDetail[];
  sales: SalesHistoryRow[];
  receipts: Record<string, string>;
  refunds: Array<{ returnInvoice: string; openingEntry: string; amount: number; mode: string }>;
  shifts: ShiftHistoryRow[];
  carts: Record<string, unknown[]>;
  payments: Record<string, unknown[]>;
  benefits: Record<string, Row>;
  customers: Record<string, Row>;
  customerCache: Record<string, Row>;
  customerSyncedAt: string | null;
  items: Record<string, Row>;
  prices: Record<string, Row>;
  stock: Record<string, Row>;
  barcodes: Row[];
  conversions: Row[];
  catalogTotals: CatalogTotals;
  sessions: Record<string, { openingEntry: string; data: Row; syncedAt: string }>;
  bootstraps: Record<string, { data: Row; syncedAt: string }>;
  profiles: Record<string, { data: Row; syncedAt: string }>;
}

const emptySettings = (): AppSettings => ({ erpnextUrl: "", apiKey: "", apiSecret: "", terminalId: "", posProfile: "", branch: "", warehouse: "", receiptPrinter: "", colorTheme: "warm-market" });
const emptyStore = (): MobileStore => ({
  meta: { schema_version: "3", created_at: new Date().toISOString() }, settings: {}, fbr: {}, fbrState: { serviceFee: 0, lastSynced: null },
  held: [], sales: [], receipts: {}, refunds: [], shifts: [], carts: {}, payments: {}, benefits: {}, customers: {}, customerCache: {}, customerSyncedAt: null,
  items: {}, prices: {}, stock: {}, barcodes: [], conversions: [], catalogTotals: { items: 0, prices: 0, barcodes: 0, stockRows: 0, lastSynced: null },
  sessions: {}, bootstraps: {}, profiles: {}
});

interface AndroidStoreBridge { load(): string; save(value: string): void; }
const nativeStore = (): AndroidStoreBridge | undefined => (globalThis as unknown as { AndroidStore?: AndroidStoreBridge }).AndroidStore;
let state = emptyStore();
let ready = false;

function persist(): void {
  const value = JSON.stringify(state);
  const native = nativeStore();
  if (native) native.save(value); else localStorage.setItem("aimatic-pos-mobile", value);
}

function rowText(row: Row, key: string): string { return typeof row[key] === "string" ? String(row[key]) : ""; }
function normalizeMobile(value: string): string { const d=value.replace(/\D/g,""); if(d.startsWith("92"))return `+${d}`;if(d.startsWith("0"))return `+92${d.slice(1)}`;if(d.length===10&&d.startsWith("3"))return `+92${d}`;return value.startsWith("+")?`+${d}`:""; }
function now(): string { return new Date().toISOString(); }

export const mobileDatabase: IDatabaseService = {
  initDatabase() {
    if (ready) return;
    try {
      const raw = nativeStore()?.load() || localStorage.getItem("aimatic-pos-mobile") || "";
      if (raw) state = { ...emptyStore(), ...JSON.parse(raw) as MobileStore };
    } catch { state = emptyStore(); }
    ready = true;
  },
  closeDatabase() { persist(); },
  getDatabaseStatus() { return { isReady: ready, path: "Android app storage", schemaVersion: state.meta.schema_version ?? "3" }; },
  normalizeErpnextUrl(value) { let v=String(value??"").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g,"").trim();if(!v)return "";if(v.startsWith("//"))v=`https:${v}`;if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(v))v=`https://${v}`;try{return new URL(v).toString().replace(/\/+$/,"");}catch{return v.replace(/\/+$/,"");} },
  getMeta(key) { return state.meta[key] ?? null; },
  setMeta(key, value) { state.meta[key]=value;persist(); },
  getOrCreateHardwareId() { const existing=state.meta.hardware_id;if(existing)return existing;const id=globalThis.crypto.randomUUID();state.meta.hardware_id=id;persist();return id; },
  saveSettings(settings) {
    const previous=mobileDatabase.loadSettings();
    const normalized=mobileDatabase.normalizeErpnextUrl(settings.erpnextUrl);
    if(previous.erpnextUrl!==normalized||(Boolean(settings.apiKey)&&previous.apiKey!==settings.apiKey)){
      state.fbr={};state.fbrState={serviceFee:0,lastSynced:null};state.held=[];state.carts={};state.payments={};state.benefits={};
      state.customers={};state.customerCache={};state.customerSyncedAt=null;state.items={};state.prices={};state.stock={};state.barcodes=[];state.conversions=[];
      state.catalogTotals={items:0,prices:0,barcodes:0,stockRows:0,lastSynced:null};state.sessions={};state.bootstraps={};state.profiles={};
    }
    state.settings={ ...state.settings, ...settings, apiSecret:settings.apiSecret||previous.apiSecret, erpnextUrl:normalized };persist();return { saved: true };
  },
  loadSettings() { return { ...emptySettings(), ...state.settings }; },
  getSettingsForRenderer() { const s=mobileDatabase.loadSettings();return { erpnextUrl:s.erpnextUrl,apiKey:s.apiKey,terminalId:s.terminalId,posProfile:s.posProfile,branch:s.branch,warehouse:s.warehouse,hasApiSecret:Boolean(s.apiSecret),receiptPrinter:"Android Print Service",colorTheme:s.colorTheme||"warm-market" } satisfies RendererSettings; },
  upsertFbrItemConfig(rows, serviceFee) { for(const row of rows){const code=rowText(row,"item_code");if(code)state.fbr[code]={...state.fbr[code],...row};}state.fbrState={serviceFee,lastSynced:now()};persist(); },
  getFbrSyncState() { return { itemCount:Object.keys(state.fbr).length,serviceFee:state.fbrState.serviceFee,lastSynced:state.fbrState.lastSynced,ready:true }; },
  getFbrItemConfigs(codes) { return Object.fromEntries(codes.filter(c=>state.fbr[c]).map(c=>[c,state.fbr[c]])); },
  holdSale(input) { const id=Math.max(0,...state.held.map(x=>x.id))+1;const stamp=now();state.held.push({...input,id,createdAt:stamp,updatedAt:stamp,status:"Held"});persist();return{id,displayName:input.displayName}; },
  listHeldSales() { return state.held.filter(x=>x.status==="Held").sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(({company:_c,branch:_b,cart:_ca,payments:_p,benefits:_be,totals:_t,validationSnapshot:_v,...x})=>x); },
  getHeldSale(id) { return state.held.find(x=>x.id===id)??null; },
  deleteHeldSale(id) { state.held=state.held.filter(x=>x.id!==id);persist(); },
  deleteAllHeldSales() { const n=state.held.length;state.held=[];persist();return n; },
  renameHeldSale(id,name) { const x=state.held.find(v=>v.id===id);if(x){x.displayName=name;x.updatedAt=now();persist();} },
  listSalesHistory(filter: SalesHistoryFilter) { const q=(filter.search??"").toLowerCase();const from=filter.dateFrom??"";const to=filter.dateTo??"";const rows=state.sales.filter(x=>(!q||x.terminalInvoiceId.toLowerCase().includes(q)||(x.posInvoice??"").toLowerCase().includes(q))&&(!from||x.createdAt>=from)&&(!to||x.createdAt<=to)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return rows.slice(filter.offset??0,(filter.offset??0)+(filter.limit??50)); },
  setSaleHistoryStatus(id,status) { const x=state.sales.find(v=>v.terminalInvoiceId===id);if(x){x.status=status;persist();} },
  getSaleHistory(id) { return state.sales.find(x=>x.terminalInvoiceId===id)??null; },
  recordReprint(id) { const x=state.sales.find(v=>v.terminalInvoiceId===id);const stamp=now();if(x){x.reprintCount=(x.reprintCount||0)+1;x.lastReprintedAt=stamp;persist();return{reprintCount:x.reprintCount,lastReprintedAt:stamp};}return{reprintCount:0,lastReprintedAt:stamp}; },
  saveSaleHistory(id,status,payload,response=null) { const stamp=now();const existing=state.sales.find(x=>x.terminalInvoiceId===id);const value:SalesHistoryRow={terminalInvoiceId:id,posInvoice:typeof response?.pos_invoice==="string"?response.pos_invoice:(existing?.posInvoice??null),status,createdAt:existing?.createdAt??stamp,submittedAt:status==="Submitted"?stamp:(existing?.submittedAt??null),reprintCount:existing?.reprintCount??0,lastReprintedAt:existing?.lastReprintedAt??null,payload,response};if(existing)Object.assign(existing,value);else state.sales.push(value);persist(); },
  cacheReceiptHtml(invoice,html) { if(invoice){state.receipts[invoice]=html;persist();} },
  getCachedReceiptHtml(invoice) { return state.receipts[invoice]??null; },
  getQueuedSales() { return state.sales.filter(x=>x.status==="Queued").sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(x=>({terminalInvoiceId:x.terminalInvoiceId,payload:x.payload??{},response:x.response,createdAt:x.createdAt} satisfies QueuedSale)); },
  logRefund(returnInvoice,openingEntry,amount,mode="") { const key=returnInvoice||`refund-${Date.now()}`;const x=state.refunds.find(v=>v.returnInvoice===key);const value={returnInvoice:key,openingEntry,amount:Math.abs(amount)||0,mode};if(x)Object.assign(x,value);else state.refunds.push(value);persist(); },
  getShiftRefundTotal(openingEntry) { return state.refunds.filter(x=>x.openingEntry===openingEntry).reduce((n,x)=>n+x.amount,0); },
  getShiftRefundBreakdown(openingEntry) { const out:Record<string,number>={};for(const x of state.refunds.filter(v=>v.openingEntry===openingEntry))out[x.mode]=(out[x.mode]??0)+x.amount;return out; },
  getQueueCounts() { return {queued:state.sales.filter(x=>x.status==="Queued").length,failed:state.sales.filter(x=>x.status==="Failed").length}; },
  getOpenTerminalInvoice(hardwareId,createId) { const x=[...state.sales].reverse().find(v=>v.status==="Open"&&v.payload?.hardware_id===hardwareId);if(x)return x.terminalInvoiceId;const id=createId();mobileDatabase.saveSaleHistory(id,"Open",{hardware_id:hardwareId});return id; },
  saveShiftHistory(input: ShiftHistoryInput) { const value:ShiftHistoryRow={...input,createdAt:now()};const x=state.shifts.find(v=>v.openingEntry===input.openingEntry);if(x)Object.assign(x,value);else state.shifts.push(value);persist(); },
  listShiftHistory(limit=100) { return [...state.shifts].sort((a,b)=>(b.closedAt??b.createdAt).localeCompare(a.closedAt??a.createdAt)).slice(0,Math.min(Math.max(limit,1),500)); },
  getShiftHistory(openingEntry) { return state.shifts.find(x=>x.openingEntry===openingEntry)??null; },
  loadCartState(terminalId,openingEntry) { const cartKey=`${terminalId}::${openingEntry}`;return{cartKey,lines:state.carts[cartKey]??[]}; },
  saveCartState(terminalId,openingEntry,lines) { state.carts[`${terminalId}::${openingEntry}`]=lines;persist(); },
  loadPaymentDraft(key) { return state.payments[key]??[]; },
  savePaymentDraft(key,payments) { state.payments[key]=payments;persist(); },
  loadBenefitsDraft(key) { return state.benefits[key]??null; },
  saveBenefitsDraft(key,benefits) { state.benefits[key]=benefits;persist(); },
  upsertCustomers(customers) { for(const row of customers){const name=rowText(row,"name");if(name)state.customers[name]={...state.customers[name],...row};}state.customerSyncedAt=now();persist(); },
  getCustomerSyncState() { return{count:Object.keys(state.customers).length,lastSynced:state.customerSyncedAt}; },
  searchCustomers(query) { const q=query.trim().toLowerCase();if(!q)return[];return Object.values(state.customers).filter(x=>!x.disabled&&["name","customer_name","mobile_no","email_id","tax_id"].some(k=>String(x[k]??"").toLowerCase().includes(q))).sort((a,b)=>rowText(a,"customer_name").localeCompare(rowText(b,"customer_name"))).slice(0,8); },
  findCustomerByNormalizedMobile(mobile) { return Object.values(state.customers).find(x=>normalizeMobile(String(x.mobile_no??""))===mobile)??null; },
  cacheCustomer(name,data) { state.customerCache[name]=data;persist(); },
  getCachedCustomer(name) { return state.customerCache[name]??null; },
  upsertCatalog(data) { for(const x of data.items){const k=rowText(x,"name");if(k)state.items[k]={...state.items[k],...x};}for(const x of data.prices){const k=rowText(x,"name")||`${rowText(x,"item_code")}:${rowText(x,"uom")}`;if(k)state.prices[k]={...state.prices[k],...x};}for(const x of data.stock){const k=`${rowText(x,"item_code")}:${rowText(x,"warehouse")}`;state.stock[k]={...state.stock[k],...x};}if(data.replaceBarcodes)state.barcodes=[];for(const x of data.barcodes){const parent=rowText(x,"item_code")||rowText(x,"parent"),barcode=rowText(x,"barcode");state.barcodes=state.barcodes.filter(v=>!(rowText(v,"parent")===parent&&rowText(v,"barcode")===barcode));state.barcodes.push({...x,parent});}if(data.replaceConversions)state.conversions=[];for(const x of data.conversions){const parent=rowText(x,"item_code")||rowText(x,"parent"),uom=rowText(x,"uom");state.conversions=state.conversions.filter(v=>!(rowText(v,"parent")===parent&&rowText(v,"uom")===uom));state.conversions.push({...x,parent});}state.catalogTotals={items:Object.keys(state.items).length,prices:Object.keys(state.prices).length,barcodes:state.barcodes.length,stockRows:Object.keys(state.stock).length,lastSynced:data.totals.lastSynced};persist(); },
  getCatalogTotals() { return state.catalogTotals; },
  searchCatalog(query,warehouse) { const q=query.trim().toLowerCase();if(!q)return[];const codes=Object.keys(state.items).filter(code=>{const x=state.items[code];return !x.disabled&&x.is_sales_item!==false&&(code.toLowerCase().includes(q)||rowText(x,"item_name").toLowerCase().includes(q)||state.barcodes.some(b=>rowText(b,"parent")===code&&rowText(b,"barcode")===query));}).slice(0,50);return codes.map(code=>catalogResult(code,query,warehouse)); },
  lookupCatalog(query,warehouse) { const results=mobileDatabase.searchCatalog(query,warehouse);const exact=results.find(x=>x.itemCode===query||x.barcode===query)??null;return{exact,results}; },
  cachePosSession(openingEntry,posProfile,_user,session,syncedAt) { state.sessions[posProfile]={openingEntry,data:session,syncedAt};persist(); },
  getCachedPosSession(posProfile) { return state.sessions[posProfile]?.data??null; },
  cachePosBootstrap(posProfile,configuration,syncedAt) { state.bootstraps[posProfile]={data:configuration,syncedAt};persist(); },
  getPosBootstrap(posProfile) { return state.bootstraps[posProfile]?.data??null; },
  cachePosProfile(name,data) { const stamp=now();state.profiles[name]={data,syncedAt:stamp};persist();return stamp; },
  getPosProfileCacheStatus() { const values=Object.values(state.profiles);return{isReady:values.length>0,lastSynced:values.sort((a,b)=>b.syncedAt.localeCompare(a.syncedAt))[0]?.syncedAt??null}; }
};

function catalogResult(code: string, query: string, warehouse: string): CatalogSearchResult {
  const item=state.items[code]??{};const barcode=state.barcodes.find(x=>rowText(x,"parent")===code&&rowText(x,"barcode")===query);const uom=rowText(barcode??{},"uom")||rowText(item,"stock_uom");const conversion=Number(state.conversions.find(x=>rowText(x,"parent")===code&&rowText(x,"uom")===uom)?.conversion_factor??1)||1;
  const prices=Object.values(state.prices).filter(x=>rowText(x,"item_code")===code);const direct=prices.find(x=>rowText(x,"uom")===uom);const base=prices.find(x=>rowText(x,"uom")===rowText(item,"stock_uom"));const selected=direct??base;const rate=typeof selected?.price_list_rate==="number"?selected.price_list_rate:null;const stock=state.stock[`${code}:${warehouse}`];const fbr=state.fbr[code];
  return{itemCode:code,itemName:rowText(item,"item_name")||code,barcode:barcode?rowText(barcode,"barcode"):null,uom,conversionFactor:conversion,sellingPrice:rate===null?null:(direct?rate:rate*conversion),currency:selected?rowText(selected,"currency")||null:null,actualStock:typeof stock?.actual_qty==="number"?stock.actual_qty:null,warehouse:stock?warehouse:null,mrp:typeof fbr?.custom_mrp==="number"?fbr.custom_mrp:null};
}

mobileDatabase.initDatabase();
