const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const home = os.homedir();
const localJdks = path.join(home, ".local", "jdks");
const detectedJdk = fs.existsSync(localJdks)
  ? fs.readdirSync(localJdks).filter(name => name.startsWith("jdk-21")).sort().at(-1)
  : undefined;
const javaHome = process.env.JAVA_HOME || (detectedJdk ? path.join(localJdks, detectedJdk) : "");
if (!javaHome || !fs.existsSync(path.join(javaHome, "bin", "java"))) {
  throw new Error("JDK 21 was not found. Set JAVA_HOME to a JDK 21 installation.");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: process.env.ANDROID_HOME || path.join(home, "Android", "Sdk") }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "android:sync"], root);
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["assembleDebug"], path.join(root, "android"));

const source = path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const outputDir = path.join(root, "dist-apk");
const target = path.join(outputDir, `Aimatic-POS-App-${pkg.version}-debug.apk`);
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`APK: ${target}`);
