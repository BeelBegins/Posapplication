const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { loadProductProfile } = require("./product-profile.cjs");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const profile = loadProductProfile(undefined, "capacitor");
const out = path.join(root, "android-web");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const buildOptions = {
  bundle: true, platform: "browser", format: "iife", target: ["chrome120"], sourcemap: false, minify: true,
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_PRODUCT__: JSON.stringify(profile.id) }
};

if (profile.id === "pos") {
  let html = fs.readFileSync(path.join(root, "dist/renderer/index.html"), "utf8");
  html = html
    .replace('<script src="renderer.js"></script>', '<script src="mobile.js"></script>\n    <script src="renderer.js"></script>')
    .replace("<p class=\"eyebrow\">Desktop POS</p>", "<p class=\"eyebrow\">Android POS</p>");
  fs.writeFileSync(path.join(out, "index.html"), html);
  fs.copyFileSync(path.join(root, "dist/renderer/renderer.js"), path.join(out, "renderer.js"));
  fs.copyFileSync(path.join(root, "dist/renderer/styles.css"), path.join(out, "styles.css"));
  esbuild.buildSync({ ...buildOptions, entryPoints: [path.join(root, "src/mobile/mobile.ts")], outfile: path.join(out, "mobile.js") });
} else if (profile.id === "restaurant") {
  const source = path.join(root, "src", "products", "restaurant");
  fs.copyFileSync(path.join(source, "index.html"), path.join(out, "index.html"));
  fs.copyFileSync(path.join(source, "styles.css"), path.join(out, "styles.css"));
  esbuild.buildSync({ ...buildOptions, entryPoints: [path.join(source, "app.ts")], outfile: path.join(out, "app.js") });
} else {
  throw new Error(`${profile.name} has no Android entry point.`);
}
