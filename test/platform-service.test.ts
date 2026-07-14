import assert from "node:assert/strict";
import test from "node:test";
import { createPlatformService } from "../src/platform/platform-service";

test("Electron and Capacitor expose isolated capabilities", () => {
  const electron = createPlatformService("electron", "pos");
  const capacitor = createPlatformService("capacitor", "pos");
  assert.equal(electron.capabilities.desktopPrinting, true);
  assert.equal(electron.capabilities.androidPrinting, false);
  assert.equal(capacitor.capabilities.desktopPrinting, false);
  assert.equal(capacitor.capabilities.androidPrinting, true);
});
