import { requireBuildableProfile, type AppPlatform, type ProductId } from "../config/product-profile";
import type { PlatformCapabilities, RuntimeInfo } from "./platform-types";

const capabilities: Record<AppPlatform, PlatformCapabilities> = {
  electron: {
    desktopPrinting: true,
    customerDisplay: true,
    keyboardShortcuts: true,
    androidPrinting: false,
    cameraScanner: false,
    pushNotifications: false
  },
  capacitor: {
    desktopPrinting: false,
    customerDisplay: false,
    keyboardShortcuts: false,
    androidPrinting: true,
    cameraScanner: true,
    pushNotifications: false
  },
  web: {
    desktopPrinting: false,
    customerDisplay: false,
    keyboardShortcuts: false,
    androidPrinting: false,
    cameraScanner: false,
    pushNotifications: false
  }
};

export function createPlatformService(platform: AppPlatform, product: ProductId): RuntimeInfo {
  requireBuildableProfile(product, platform);
  return { platform, product, capabilities: { ...capabilities[platform] } };
}
