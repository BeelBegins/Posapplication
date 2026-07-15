import profilesJson from "./product-profiles.json";

export type ProductId = "pos" | "restaurant" | "sales" | "shopping";
export type AppPlatform = "electron" | "capacitor" | "web";
export type AuthenticationMode = "terminal-token" | "user-session" | "customer-session";
export type AndroidOrientation = "sensorPortrait" | "sensorLandscape" | "unspecified";

export interface ProductProfile {
  id: ProductId;
  name: string;
  enabled: boolean;
  platforms: AppPlatform[];
  androidAppId: string;
  androidOrientation: AndroidOrientation;
  storageNamespace: string;
  authentication: AuthenticationMode;
  features: string[];
}

const profiles = profilesJson as Record<ProductId, ProductProfile>;

export function getProductProfile(id: ProductId): ProductProfile {
  const profile = profiles[id];
  if (!profile) throw new Error(`Unknown Ai Matic product profile: ${id}`);
  return profile;
}

export function listProductProfiles(): ProductProfile[] {
  return Object.values(profiles);
}

export function requireBuildableProfile(id: ProductId, platform: AppPlatform): ProductProfile {
  const profile = getProductProfile(id);
  if (!profile.enabled) throw new Error(`${profile.name} is reserved for a later development phase.`);
  if (!profile.platforms.includes(platform)) throw new Error(`${profile.name} does not support ${platform}.`);
  return profile;
}
