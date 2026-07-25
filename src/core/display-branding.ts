const upstreamProductName = new RegExp(`\\b${["ERP", "Next"].join("")}\\b`, "gi");

export function normalizeErpDisplayText(value: string): string {
  return value.replace(upstreamProductName, "ERP");
}
