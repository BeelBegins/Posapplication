// Obfuscates the compiled JS in dist/ in place, just before electron-builder packages it.
// Runs only via `npm run dist` — the normal `npm run build` / `npm start` stay readable for dev.
//
// Settings are deliberately conservative so Electron keeps working:
//   - renameGlobals:false      -> window.posAPI, module, require, __dirname stay intact
//   - transformObjectKeys:false-> contextBridge keys + IPC channel object keys are NOT renamed
//   - stringArray keeps the runtime string VALUES identical (IPC channel names like "db:getStatus" still match)
//   - selfDefending / debugProtection OFF -> avoids hard-to-debug runtime breakage in Electron
const fs = require("node:fs");
const path = require("node:path");
const JavaScriptObfuscator = require("javascript-obfuscator");

const DIST = path.join(__dirname, "..", "dist");

const baseOptions = {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  transformObjectKeys: false,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ["base64"],
  splitStrings: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  numbersToExpressions: false,
  simplify: true,
  unicodeEscapeSequence: false
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const files = walk(DIST);
let count = 0;
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  // renderer code runs in the browser context; main/preload run in Node.
  const target = file.replace(/\\/g, "/").includes("/renderer/") ? "browser" : "node";
  const result = JavaScriptObfuscator.obfuscate(code, { ...baseOptions, target });
  fs.writeFileSync(file, result.getObfuscatedCode(), "utf8");
  count += 1;
}
console.log(`Obfuscated ${count} file(s) in dist/`);
