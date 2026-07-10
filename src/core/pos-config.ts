import type { PosCoreDeps, PosProfileDetails, PosProfileOption, PosConfigurationSummary } from "./types";
import type { createHttpCore } from "./http";
import { asRecord, textValue, unwrapFrappePayload, getResponseError } from "./http";

function summarizePosConfiguration(configuration: Record<string, unknown>): PosConfigurationSummary | null {
  const profile = asRecord(configuration.pos_profile);
  if (!profile) {
    return null;
  }
  const taxTemplate = asRecord(configuration.tax_template);
  const paymentModes = Array.isArray(configuration.payment_modes) ? configuration.payment_modes : [];
  const taxRows = Array.isArray(taxTemplate?.taxes) ? taxTemplate.taxes : [];
  const syncedAt = textValue(configuration, "synced_at");

  if (!syncedAt) {
    return null;
  }

  return {
    posProfile: textValue(profile, "name"),
    company: textValue(profile, "company"),
    branch: textValue(profile, "branch") || textValue(profile, "custom_branch"),
    warehouse: textValue(profile, "warehouse"),
    defaultCustomer: textValue(profile, "customer"),
    sellingPriceList: textValue(profile, "selling_price_list"),
    currency: textValue(profile, "currency"),
    taxTemplate: taxTemplate ? textValue(taxTemplate, "name") || textValue(profile, "taxes_and_charges") : null,
    taxRowsCount: taxRows.length,
    paymentMethodsCount: paymentModes.length,
    lastSynced: syncedAt,
    cacheStatus: "Ready"
  };
}

/**
 * POS Profile/configuration sync, cart preview, and customer benefits/coupon/gift-voucher
 * lookups. Depends on the already-bound http core (for fetchErpResource).
 */
export function createPosConfigCore(deps: PosCoreDeps, http: ReturnType<typeof createHttpCore>) {
  async function previewCart(input: Record<string, unknown>): Promise<{ preview: Record<string, unknown> | null; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret) return { preview: null, error: "Offline Estimate — Not Server Validated" };
    try {
      const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      const payload: Record<string, unknown> = {
        pos_profile: String(input.pos_profile ?? settings.posProfile),
        customer: String(input.customer ?? ""),
        items: Array.isArray(input.items) ? input.items : []
      };
      if (input.coupon_code) payload.coupon_code = String(input.coupon_code);
      if (input.redeem_loyalty_points) payload.redeem_loyalty_points = input.redeem_loyalty_points;
      if (input.loyalty_points) payload.loyalty_points = input.loyalty_points;
      if (input.gift_voucher_code) payload.gift_voucher_code = String(input.gift_voucher_code);
      const response = await deps.fetch(`${base}/api/method/aimatic.offline_pos.api.preview_cart`, {
        method: "POST",
        headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) return { preview: null, error: await getResponseError(response) };
      const body = await response.json() as { message?: unknown; data?: unknown };
      const rawPreview = asRecord(body.message) ?? asRecord(body.data);
      const preview = asRecord(rawPreview?.message) ?? rawPreview;
      return preview ? { preview, error: null } : { preview: null, error: "Cart preview returned no data." };
    } catch (error) {
      return { preview: null, error: error instanceof Error ? error.message : "Offline Estimate — Not Server Validated" };
    }
  }

  async function syncPosConfiguration(): Promise<{ success: boolean; summary: PosConfigurationSummary | null; error: string | null }> {
    const settings = deps.db.loadSettings();
    const { erpnextUrl, apiKey, apiSecret, posProfile } = settings;
    if (!erpnextUrl.trim() || !apiKey.trim() || !apiSecret.trim() || !posProfile.trim()) {
      return { success: false, summary: null, error: "ERPNext URL, API Key, API Secret, and POS Profile are required." };
    }

    try {
      const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
      const profile = await http.fetchErpResource(baseUrl, apiKey, apiSecret, "POS Profile", posProfile);
      const companyName = textValue(profile, "company");
      const taxTemplateName = textValue(profile, "taxes_and_charges");
      const company = companyName ? await http.fetchErpResource(baseUrl, apiKey, apiSecret, "Company", companyName) : null;
      const taxTemplate = taxTemplateName
        ? await http.fetchErpResource(baseUrl, apiKey, apiSecret, "Sales Taxes and Charges Template", taxTemplateName)
        : null;
      const paymentNames = [...new Set(
        (Array.isArray(profile.payments) ? profile.payments : [])
          .map(asRecord)
          .map((payment) => textValue(payment, "mode_of_payment"))
          .filter(Boolean)
      )];
      const paymentModes = await Promise.all(
        paymentNames.map((paymentName) => http.fetchErpResource(baseUrl, apiKey, apiSecret, "Mode of Payment", paymentName))
      );
      const syncedAt = new Date().toISOString();
      const configuration: Record<string, unknown> = {
        pos_profile: profile,
        company,
        tax_template: taxTemplate,
        payment_modes: paymentModes,
        synced_at: syncedAt
      };
      const branch = textValue(profile, "branch") || textValue(profile, "custom_branch");
      deps.db.saveSettings({ ...settings, branch });
      deps.db.cachePosBootstrap(posProfile, configuration, syncedAt);

      return { success: true, summary: summarizePosConfiguration(configuration), error: null };
    } catch (error) {
      return { success: false, summary: null, error: error instanceof Error ? error.message : "POS Configuration Sync Failed." };
    }
  }

  function getCachedPosConfiguration(): PosConfigurationSummary | null {
    const { posProfile } = deps.db.loadSettings();
    const configuration = deps.db.getPosBootstrap(posProfile);
    return configuration ? summarizePosConfiguration(configuration) : null;
  }

  async function loadAvailablePosProfiles(): Promise<{ success: boolean; profiles: PosProfileOption[]; error: string | null }> {
    const { erpnextUrl, apiKey, apiSecret } = deps.db.loadSettings();

    if (!erpnextUrl.trim() || !apiKey.trim() || !apiSecret.trim()) {
      return { success: false, profiles: [], error: "ERPNext URL, API Key, and API Secret are required." };
    }

    let endpoint: string;
    try {
      const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
      const query = new URLSearchParams({
        fields: '["name","company","warehouse"]',
        limit_page_length: "100"
      });
      endpoint = `${baseUrl}/api/resource/POS%20Profile?${query.toString()}`;
    } catch {
      return { success: false, profiles: [], error: "ERPNext URL is not valid." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await deps.fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `token ${apiKey}:${apiSecret}` },
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, profiles: [], error: await getResponseError(response) };
      }

      const body = await response.json() as { data?: unknown };
      if (!Array.isArray(body.data)) {
        return { success: false, profiles: [], error: "ERPNext returned no POS Profile list." };
      }

      const profiles = body.data.flatMap((profile): PosProfileOption[] => {
        if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
          return [];
        }
        const record = profile as Record<string, unknown>;
        if (typeof record.name !== "string") {
          return [];
        }
        return [{
          name: record.name,
          company: typeof record.company === "string" ? record.company : "",
          warehouse: typeof record.warehouse === "string" ? record.warehouse : ""
        }];
      });

      return { success: true, profiles, error: null };
    } catch (error) {
      return {
        success: false,
        profiles: [],
        error: error instanceof Error ? error.message : "Unable to load POS Profiles."
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadPosProfile(): Promise<{ success: boolean; profile: PosProfileDetails | null; error: string | null; syncedAt: string | null }> {
    const settings = deps.db.loadSettings();
    const { erpnextUrl, apiKey, apiSecret, posProfile } = settings;

    if (!erpnextUrl.trim() || !apiKey.trim() || !apiSecret.trim() || !posProfile.trim()) {
      return { success: false, profile: null, error: "ERPNext URL, API Key, API Secret, and POS Profile are required.", syncedAt: null };
    }

    let endpoint: string;
    try {
      const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
      endpoint = `${baseUrl}/api/resource/POS%20Profile/${encodeURIComponent(posProfile.trim())}`;
    } catch {
      return { success: false, profile: null, error: "ERPNext URL is not valid.", syncedAt: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await deps.fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `token ${apiKey}:${apiSecret}` },
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, profile: null, error: await getResponseError(response), syncedAt: null };
      }

      const body = await response.json() as { data?: unknown; message?: unknown };
      const profileData = typeof body.data === "object" && body.data !== null && !Array.isArray(body.data)
        ? body.data as Record<string, unknown>
        : typeof body.message === "object" && body.message !== null && !Array.isArray(body.message)
          ? body.message as Record<string, unknown>
          : null;

      if (!profileData) {
        return { success: false, profile: null, error: "ERPNext returned no POS Profile data.", syncedAt: null };
      }

      const value = (key: string): string => typeof profileData[key] === "string" ? profileData[key] as string : "";
      const paymentMethods = Array.isArray(profileData.payments)
        ? profileData.payments
        : Array.isArray(profileData.payment_methods)
          ? profileData.payment_methods
          : [];
      const branch = value("branch") || value("custom_branch");

      deps.db.saveSettings({ ...settings, branch });
      const syncedAt = deps.db.cachePosProfile(value("name") || posProfile, profileData);

      return {
        success: true,
        error: null,
        syncedAt,
        profile: {
          company: value("company"),
          warehouse: value("warehouse"),
          branch,
          customer: value("customer"),
          priceList: value("selling_price_list"),
          currency: value("currency"),
          paymentMethodsCount: paymentMethods.length
        }
      };
    } catch (error) {
      return {
        success: false,
        profile: null,
        error: error instanceof Error ? error.message : "Unable to load POS Profile.",
        syncedAt: null
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getCustomerBenefits(customerName: string): Promise<{ loyaltyProgram: string | null; availablePoints: number; conversionFactor: number; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !customerName) {
      return { loyaltyProgram: null, availablePoints: 0, conversionFactor: 1, error: null };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
      const query = new URLSearchParams({ customer: customerName, pos_profile: settings.posProfile });
      const response = await deps.fetch(`${baseUrl}/api/method/aimatic.offline_pos.api.get_customer_benefits?${query.toString()}`, {
        headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}` },
        signal: controller.signal
      });
      if (!response.ok) {
        return { loyaltyProgram: null, availablePoints: 0, conversionFactor: 1, error: await getResponseError(response) };
      }
      const body = await response.json() as { message?: unknown };
      const data = asRecord(body.message);
      return {
        loyaltyProgram: textValue(data, "loyalty_program") || null,
        availablePoints: typeof data?.available_loyalty_points === "number" ? data.available_loyalty_points as number : 0,
        conversionFactor: typeof data?.conversion_factor === "number" ? data.conversion_factor as number : 1,
        error: null
      };
    } catch (error) {
      return { loyaltyProgram: null, availablePoints: 0, conversionFactor: 1, error: error instanceof Error ? error.message : "Unable to load customer benefits." };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function validateCoupon(couponCode: string): Promise<{ couponName: string | null; discountAmount: number; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !couponCode) {
      return { couponName: null, discountAmount: 0, error: "Online connection required to validate coupon." };
    }
    try {
      const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
      const coupon = await http.fetchErpResource(baseUrl, settings.apiKey, settings.apiSecret, "Coupon Code", couponCode);
      const couponName = textValue(coupon, "name") || couponCode;
      const discountAmount = typeof coupon.discount_amount === "number" ? coupon.discount_amount as number : 0;
      return { couponName, discountAmount, error: null };
    } catch (error) {
      return { couponName: null, discountAmount: 0, error: error instanceof Error ? error.message : "Invalid coupon code." };
    }
  }

  async function listCustomerGiftVouchers(customerName: string): Promise<{ vouchers: Record<string, unknown>[]; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !customerName) {
      return { vouchers: [], error: "Online connection required to load gift vouchers." };
    }
    try {
      const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
      const company = textValue(asRecord(deps.db.getPosBootstrap(settings.posProfile)?.pos_profile), "company");
      const query = new URLSearchParams({ customer: customerName });
      if (company) query.set("company", company);
      const response = await deps.fetch(`${baseUrl}/api/method/aimatic.gift_voucher.api.list_customer_gift_vouchers?${query.toString()}`, {
        headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}` }
      });
      if (!response.ok) return { vouchers: [], error: await getResponseError(response) };
      const body = await response.json() as Record<string, unknown>;
      const payload = unwrapFrappePayload(body);
      const raw = Array.isArray(payload.vouchers) ? payload.vouchers : Array.isArray(payload) ? payload : Array.isArray(body.message) ? body.message : [];
      const vouchers = raw.map(asRecord).filter((x): x is Record<string, unknown> => Boolean(x));
      return { vouchers, error: null };
    } catch (error) {
      return { vouchers: [], error: error instanceof Error ? error.message : "Unable to load gift vouchers." };
    }
  }

  async function validateGiftVoucherCode(voucherCode: string, customerName: string): Promise<{ voucher: Record<string, unknown> | null; error: string | null }> {
    const settings = deps.db.loadSettings();
    const code = voucherCode.trim();
    if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !code || !customerName) {
      return { voucher: null, error: "Online connection required to validate gift voucher." };
    }
    try {
      const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
      const response = await deps.fetch(`${baseUrl}/api/method/aimatic.gift_voucher.api.validate_gift_voucher_code`, {
        method: "POST",
        headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ voucher_code: code, customer: customerName })
      });
      if (!response.ok) return { voucher: null, error: await getResponseError(response) };
      const body = await response.json() as Record<string, unknown>;
      const payload = unwrapFrappePayload(body);
      return { voucher: payload, error: null };
    } catch (error) {
      return { voucher: null, error: error instanceof Error ? error.message : "Invalid gift voucher code." };
    }
  }

  return {
    previewCart, summarizePosConfiguration, syncPosConfiguration, getCachedPosConfiguration,
    loadAvailablePosProfiles, loadPosProfile, getCustomerBenefits, validateCoupon,
    listCustomerGiftVouchers, validateGiftVoucherCode
  };
}
