const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "android-web");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

let html = fs.readFileSync(path.join(root, "dist/renderer/index.html"), "utf8");
html = html
  .replace('<script src="renderer.js"></script>', '<script src="mobile.js"></script>\n    <script src="renderer.js"></script>')
  .replace("<p class=\"eyebrow\">Desktop POS</p>", "<p class=\"eyebrow\">Android POS</p>");
fs.writeFileSync(path.join(out, "index.html"), html);
fs.copyFileSync(path.join(root, "dist/renderer/renderer.js"), path.join(out, "renderer.js"));
fs.copyFileSync(path.join(root, "dist/renderer/styles.css"), path.join(out, "styles.css"));

esbuild.buildSync({
  entryPoints: [path.join(root, "src/mobile/mobile.ts")],
  outfile: path.join(out, "mobile.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["chrome120"],
  sourcemap: false,
  minify: true
});
