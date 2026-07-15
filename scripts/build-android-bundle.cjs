const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadProductProfile } = require("./product-profile.cjs");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const profile = loadProductProfile(undefined, "capacitor");
const home = os.homedir();
const localJdks = path.join(home, ".local", "jdks");
const detectedJdk = fs.existsSync(localJdks)
  ? fs.readdirSync(localJdks).filter(name => name.startsWith("jdk-21")).sort().at(-1)
  : undefined;
const javaHome = process.env.JAVA_HOME || (detectedJdk ? path.join(localJdks, detectedJdk) : "");
if (!javaHome || !fs.existsSync(path.join(javaHome, "bin", "java"))) {
  throw new Error("JDK 21 was not found. Set JAVA_HOME to a JDK 21 installation.");
}

const signingVariables = [
  "ANDROID_KEYSTORE_PATH",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD"
];
const missingSigningVariables = signingVariables.filter(name => !process.env[name]);
if (missingSigningVariables.length) {
  throw new Error(`A signed Play Store bundle requires: ${missingSigningVariables.join(", ")}`);
}
if (!fs.existsSync(process.env.ANDROID_KEYSTORE_PATH)) {
  throw new Error(`Android keystore not found: ${process.env.ANDROID_KEYSTORE_PATH}`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_HOME: process.env.ANDROID_HOME || path.join(home, "Android", "Sdk")
    }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "android:sync"], root);
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["bundleRelease"], path.join(root, "android"));

const source = path.join(root, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
if (!fs.existsSync(source)) throw new Error(`Android App Bundle was not created: ${source}`);

const outputDir = path.join(root, "dist-aab");
const artifactProduct = profile.name.replace(/\s+/g, "-");
const target = path.join(outputDir, `${artifactProduct}-${pkg.version}.aab`);
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Google Play bundle: ${target}`);
