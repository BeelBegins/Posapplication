import { contextBridge, ipcRenderer } from "electron";

interface AppSettings {
  erpnextUrl: string;
  apiKey: string;
  apiSecret: string;
  terminalId: string;
  posProfile: string;
  branch: string;
  warehouse: string;
}

interface RendererSettings {
  erpnextUrl: string;
  apiKey: string;
  terminalId: string;
  posProfile: string;
  branch: string;
  warehouse: string;
  hasApiSecret: boolean;
}

contextBridge.exposeInMainWorld("posAPI", {
  getDatabaseStatus: () => ipcRenderer.invoke("db:getStatus"),
  focusPosWindow: () => ipcRenderer.invoke("window:focus-pos"),
  onFocusScanner: (callback: () => void) => ipcRenderer.on("pos:focus-scanner", () => callback()),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings),
  loadSettings: () => ipcRenderer.invoke("settings:load") as Promise<RendererSettings>,
  testServer: () => ipcRenderer.invoke("server:test"),
  testLogin: () => ipcRenderer.invoke("auth:test"),
  cashierLogin: (input: Record<string, unknown>) => ipcRenderer.invoke("cashier:login", input),
  cashierOfflineLogin: (input: Record<string, unknown>) => ipcRenderer.invoke("cashier:offline-login", input),
  getRememberedCashiers: () => ipcRenderer.invoke("cashier:remembered"),
  loadPosProfiles: () => ipcRenderer.invoke("pos-profiles:list"),
  loadPosProfile: () => ipcRenderer.invoke("pos-profile:load"),
  getPosProfileCacheStatus: () => ipcRenderer.invoke("pos-profile-cache:get-status"),
  syncPosConfiguration: () => ipcRenderer.invoke("pos-configuration:sync"),
  getCachedPosConfiguration: () => ipcRenderer.invoke("pos-configuration:get-cached"),
  syncPosSession: (input?: Record<string, unknown>) => ipcRenderer.invoke("pos-session:sync", input),
  getCachedPosSession: () => ipcRenderer.invoke("pos-session:get-cached")
  ,syncItemCatalog: (mode?: string) => ipcRenderer.invoke("catalog:sync", mode)
  ,getCatalogTotals: () => ipcRenderer.invoke("catalog:get-totals")
  ,syncFbrConfig: (mode?: string) => ipcRenderer.invoke("fbr:sync", mode)
  ,getFbrSyncState: () => ipcRenderer.invoke("fbr:state")
  ,searchCatalog: (query: string) => ipcRenderer.invoke("catalog:search", query)
  ,onCatalogProgress: (callback: (message: string) => void) => ipcRenderer.on("catalog:progress", (_event, message: string) => callback(message))
  ,lookupCatalog: (query: string) => ipcRenderer.invoke("catalog:lookup", query)
  ,loadCart: () => ipcRenderer.invoke("cart:load")
  ,saveCart: (lines: unknown[]) => ipcRenderer.invoke("cart:save", lines)
  ,syncCustomers: (mode?: string) => ipcRenderer.invoke("customers:sync", mode)
  ,getCustomerSyncState: () => ipcRenderer.invoke("customers:state")
  ,searchCustomers: (query: string) => ipcRenderer.invoke("customers:search", query)
  ,loadCustomer: (name: string) => ipcRenderer.invoke("customers:load", name)
  ,getCustomerCreationOptions: () => ipcRenderer.invoke("customers:options")
  ,createCustomer: (input: Record<string, unknown>) => ipcRenderer.invoke("customers:create", input)
  ,previewCart: (input: Record<string, unknown>) => ipcRenderer.invoke("cart:preview", input)
  ,previewFbr: (input: Record<string, unknown>) => ipcRenderer.invoke("fbr:preview", input)
  ,getPaymentMethods: () => ipcRenderer.invoke("payments:methods")
  ,loadPaymentDraft: () => ipcRenderer.invoke("payments:load")
  ,savePaymentDraft: (payments: unknown[]) => ipcRenderer.invoke("payments:save", payments)
  ,loadBenefitsDraft: () => ipcRenderer.invoke("benefits:load")
  ,saveBenefitsDraft: (benefits: Record<string, unknown>) => ipcRenderer.invoke("benefits:save", benefits)
  ,getCustomerBenefits: (customerName: string) => ipcRenderer.invoke("benefits:customer", customerName)
  ,validateCoupon: (couponCode: string) => ipcRenderer.invoke("benefits:validate-coupon", couponCode)
  ,getTerminalInvoiceId: () => ipcRenderer.invoke("sale:terminal-id")
  ,submitSale: (input: Record<string, unknown>) => ipcRenderer.invoke("sale:submit", input)
  ,queueSale: (input: Record<string, unknown>) => ipcRenderer.invoke("sale:queue", input)
  ,syncSaleQueue: () => ipcRenderer.invoke("queue:sync")
  ,getQueueStatus: () => ipcRenderer.invoke("queue:status")
  ,getActivePosSession: (input?: Record<string, unknown>) => ipcRenderer.invoke("pos-session:active", input)
  ,startPosSession: (input: Record<string, unknown>) => ipcRenderer.invoke("pos-session:start", input)
  ,onCompleteSaleShortcut: (callback: () => void) => ipcRenderer.on("pos:complete-sale-shortcut", () => callback())
  ,getReceipt: (posInvoice: string) => ipcRenderer.invoke("receipt:get", posInvoice)
  ,getDuplicateReceipt: (posInvoice: string) => ipcRenderer.invoke("receipt:get-duplicate", posInvoice)
  ,printReceipt: (html: string) => ipcRenderer.invoke("receipt:print", html)
  ,holdSale: (input: Record<string, unknown>) => ipcRenderer.invoke("held:save", input)
  ,listHeldSales: () => ipcRenderer.invoke("held:list")
  ,getHeldSale: (id: number) => ipcRenderer.invoke("held:get", id)
  ,deleteHeldSale: (id: number) => ipcRenderer.invoke("held:delete", id)
  ,renameHeldSale: (id: number, name: string) => ipcRenderer.invoke("held:rename", id, name)
  ,listSalesHistory: (filter: Record<string, unknown>) => ipcRenderer.invoke("history:list", filter)
  ,getSaleHistory: (id: string) => ipcRenderer.invoke("history:get", id)
  ,recordReprint: (id: string) => ipcRenderer.invoke("history:reprint", id)
  ,setSaleStatus: (id: string, status: string) => ipcRenderer.invoke("sale:set-status", id, status)
  ,getInvoiceForRefund: (invoiceName: string) => ipcRenderer.invoke("refund:get-invoice", invoiceName)
  ,submitPosRefund: (input: Record<string, unknown>) => ipcRenderer.invoke("refund:submit", input)
  ,getShiftSummary: (input?: Record<string, unknown>) => ipcRenderer.invoke("shift:summary", input)
  ,closeShift: (input: Record<string, unknown>) => ipcRenderer.invoke("shift:close", input)
  ,listShiftHistory: () => ipcRenderer.invoke("shift:history")
  ,getShiftHistory: (openingEntry: string) => ipcRenderer.invoke("shift:history-get", openingEntry)
  ,getAppVersion: () => ipcRenderer.invoke("update:current-version")
  ,checkForUpdate: () => ipcRenderer.invoke("update:check")
  ,downloadUpdate: () => ipcRenderer.invoke("update:download")
  ,installUpdate: () => ipcRenderer.invoke("update:install")
  ,saveUpdateToken: (token: string) => ipcRenderer.invoke("update:save-token", token)
  ,isUpdateTokenSet: () => ipcRenderer.invoke("update:token-set")
  ,onUpdateStatus: (callback: (payload: Record<string, unknown>) => void) => ipcRenderer.on("update:status", (_event, payload: Record<string, unknown>) => callback(payload))
  ,listReleases: () => ipcRenderer.invoke("releases:list")
  ,installRelease: (input: Record<string, unknown>) => ipcRenderer.invoke("releases:install", input)
  ,getAdminPinStatus: (input?: Record<string, unknown>) => ipcRenderer.invoke("admin:pin-status", input)
  ,verifyAdminPin: (input: Record<string, unknown>) => ipcRenderer.invoke("admin:pin-verify", input)
  ,authorizeAdminAction: (input: Record<string, unknown>) => ipcRenderer.invoke("admin:authorize-action", input)
  ,setAdminPin: (input: Record<string, unknown>) => ipcRenderer.invoke("admin:pin-set", input)
});
