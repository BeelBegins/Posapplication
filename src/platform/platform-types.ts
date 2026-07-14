import type { AppPlatform, ProductId } from "../config/product-profile";

export interface PlatformCapabilities {
  desktopPrinting: boolean;
  customerDisplay: boolean;
  keyboardShortcuts: boolean;
  androidPrinting: boolean;
  cameraScanner: boolean;
  pushNotifications: boolean;
}

export interface RuntimeInfo {
  platform: AppPlatform;
  product: ProductId;
  capabilities: PlatformCapabilities;
}
