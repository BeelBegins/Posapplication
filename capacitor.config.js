const profiles = require("./src/config/product-profiles.json");

const productId = process.env.AI_MATIC_PRODUCT || "pos";
const profile = profiles[productId];

if (!profile || !profile.enabled || !profile.platforms.includes("capacitor")) {
  throw new Error(`Product profile '${productId}' is not enabled for Capacitor`);
}

// The ML Kit barcode scanner adds native models for every ABI. Only POS and Sales
// have live scan workflows; keep it out of Restaurant's prototype and Shopping.
const includePlugins = ["@capacitor/app"];
if (productId === "pos" || productId === "sales") {
  includePlugins.push("@capacitor/barcode-scanner");
}
if (productId === "sales") {
  includePlugins.push("@capacitor/geolocation");
}
includePlugins.push("@capacitor/browser");

module.exports = {
  appId: profile.androidAppId,
  appName: profile.name,
  webDir: "android-web",
  server: {
    androidScheme: "https",
    cleartext: true
  },
  android: { includePlugins },
  plugins: {
    CapacitorHttp: { enabled: true }
  }
};
