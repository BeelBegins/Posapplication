import type { IDatabaseService } from "../db/IDatabaseService";
import { asRecord, textValue, unwrapFrappePayload } from "../core/http";
import type { OAuthPublicClientConfig } from "./credential-provider";
import type { SecureStorage } from "./secure-storage";

export interface DeviceEnrollment {
  baseUrl: string;
  hardwareId: string;
  posProfile: string;
  terminalId: string;
  branch: string;
  warehouse: string;
  oauthClientId: string;
  deviceToken: string;
}

const enrollmentKey = "pos.device.enrollment.v1";

export function parseEnrollmentPayload(value: string): { baseUrl: string; token: string } {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enrollment QR value is required.");
  let json: Record<string, unknown> | null = null;
  try { json = asRecord(JSON.parse(trimmed)); } catch { /* URL form below */ }
  if (json) {
    const baseUrl = textValue(json, "url").replace(/\/+$/, "");
    const token = textValue(json, "token");
    if (baseUrl && token) {
      if (new URL(baseUrl).protocol !== "https:") throw new Error("HTTPS is required for Android enrollment.");
      return { baseUrl, token };
    }
  }
  const url = new URL(trimmed);
  const token = url.searchParams.get("token") || "";
  const configuredUrl = url.searchParams.get("url") || `${url.protocol}//${url.host}`;
  if (!token) throw new Error("Enrollment QR does not contain a token.");
  const baseUrl = configuredUrl.replace(/\/+$/, "");
  if (new URL(baseUrl).protocol !== "https:") throw new Error("HTTPS is required for Android enrollment.");
  return { baseUrl, token };
}

export class DeviceEnrollmentService {
  constructor(private readonly storage: SecureStorage, private readonly db: IDatabaseService, private readonly fetchImpl: typeof fetch) {}

  async load(): Promise<DeviceEnrollment | null> {
    const raw = await this.storage.get(enrollmentKey);
    if (!raw) return null;
    try {
      const enrollment = JSON.parse(raw) as DeviceEnrollment;
      if (!enrollment.hardwareId || !enrollment.posProfile || !enrollment.oauthClientId || !enrollment.deviceToken) {
        await this.storage.remove(enrollmentKey);
        return null;
      }
      return enrollment;
    }
    catch { await this.storage.remove(enrollmentKey); return null; }
  }

  async redeem(qrValue: string): Promise<DeviceEnrollment> {
    const parsed = parseEnrollmentPayload(qrValue);
    const hardwareId = this.db.getOrCreateHardwareId();
    const response = await this.fetchImpl(`${parsed.baseUrl}/api/method/aimatic.offline_pos.api.redeem_device_enrollment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: parsed.token, hardware_id: hardwareId })
    });
    const raw = await response.json().catch(() => ({}));
    const payload = unwrapFrappePayload(raw);
    if (!response.ok) throw new Error(textValue(payload, "message") || textValue(payload, "exception") || "Device enrollment failed.");
    const enrollment: DeviceEnrollment = {
      baseUrl: parsed.baseUrl,
      hardwareId,
      posProfile: textValue(payload, "pos_profile"),
      terminalId: textValue(payload, "terminal_id"),
      branch: textValue(payload, "branch"),
      warehouse: textValue(payload, "warehouse"),
      oauthClientId: textValue(payload, "oauth_client_id"),
      deviceToken: textValue(payload, "device_token")
    };
    if (!enrollment.posProfile || !enrollment.terminalId || !enrollment.oauthClientId || !enrollment.deviceToken) throw new Error("Enrollment response is missing POS, OAuth, or device authentication configuration.");
    await this.storage.set(enrollmentKey, JSON.stringify(enrollment));
    this.db.saveSettings({ ...this.db.loadSettings(), erpnextUrl: enrollment.baseUrl, apiKey: "", apiSecret: "", terminalId: enrollment.terminalId, posProfile: enrollment.posProfile, branch: enrollment.branch, warehouse: enrollment.warehouse });
    return enrollment;
  }

  async oauthConfig(): Promise<OAuthPublicClientConfig> {
    const enrollment = await this.load();
    if (!enrollment) throw new Error("This device is not enrolled.");
    return { baseUrl: enrollment.baseUrl, clientId: enrollment.oauthClientId, redirectUri: "com.beelbegins.aimaticpos://oauth/callback", scope: "pos-device", hardwareId: enrollment.hardwareId, deviceToken: enrollment.deviceToken };
  }
}
