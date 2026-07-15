const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { loadProductProfile } = require("./product-profile.cjs");

const root = path.resolve(__dirname, "..");
const product = process.argv[2] || "shopping";
const profile = loadProductProfile(product, "web");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const source = path.join(root, "src", "products", profile.id);
const out = path.join(root, "dist-web", profile.id);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let html = fs.readFileSync(path.join(source, "index.html"), "utf8");
html = html.replace("</head>", '  <link rel="manifest" href="manifest.webmanifest" />\n</head>');
fs.writeFileSync(path.join(out, "index.html"), html);
fs.copyFileSync(path.join(source, "styles.css"), path.join(out, "styles.css"));
fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
  name: profile.name, short_name: "Ai Matic", start_url: "./", display: "standalone",
  background_color: "#f7f8f5", theme_color: "#103f35"
}, null, 2));
fs.writeFileSync(path.join(out, "service-worker.js"), `const CACHE="aimatic-${profile.id}-${pkg.version}";const SHELL=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest"];self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.pathname.includes("/api/"))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))))});`);
esbuild.buildSync({
  bundle: true, platform: "browser", format: "iife", target: ["chrome120", "safari17"], minify: true,
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_PRODUCT__: JSON.stringify(profile.id) },
  entryPoints: [path.join(source, "app.ts")], outfile: path.join(out, "app.js")
});
