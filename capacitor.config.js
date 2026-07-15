const profiles = require("./src/config/product-profiles.json");

const productId = process.env.AI_MATIC_PRODUCT || "pos";
const profile = profiles[productId];

if (!profile || !profile.enabled || !profile.platforms.includes("capacitor")) {
  throw new Error(`Product profile '${productId}' is not enabled for Capacitor`);
}

// The ML Kit barcode scanner adds native models for every ABI. Shopping has no
// scan workflow, so keep it out of that APK/App Bundle while other profiles stay unchanged.
const includePlugins = ["@capacitor/app"];
if (productId !== "shopping") {
  includePlugins.push("@capacitor/barcode-scanner");
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
