import { Browser } from "@capacitor/browser";

declare const __APP_VERSION__: string;
declare const __APP_PRODUCT__: string;

const RELEASES_LATEST = "https://api.github.com/repos/BeelBegins/Posapplication/releases/latest";
const DISMISS_KEY = `aimatic-update-dismissed:${__APP_PRODUCT__}`;

const assetNames: Record<string, string> = {
  pos: "Aimatic-POS-App-",
  restaurant: "Aimatic-Restaurant-App-",
  sales: "Aimatic-Sales-App-",
  shopping: "Aimatic-Shopping-App-",
  "stock-receiving": "Aimatic-Stock-Receiving-App-",
  hr: "Aimatic-HR-App-",
};

type ReleaseAsset = { name?: string; browser_download_url?: string };
type LatestRelease = { tag_name?: string; assets?: ReleaseAsset[] };
type UpdateTarget = { version: string; apkUrl: string };

function isNewer(candidate: string, current: string): boolean {
  const parse = (value: string) => (/^v?\d+(?:\.\d+)*$/.test(value) ? value.replace(/^v/, "").split(".").map(Number) : []);
  const a = parse(candidate);
  const b = parse(current);
  if (!a.length || !b.length) throw new Error("Invalid release version");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

function apkDownloadUrl(release: LatestRelease, version: string): string {
  const expected = `${assetNames[__APP_PRODUCT__]}${version.replace(/^v/, "")}.apk`;
  const asset = release.assets?.find((item) => item.name === expected);
  const url = new URL(asset?.browser_download_url || "");
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith("/BeelBegins/Posapplication/releases/download/")) {
    throw new Error("The APK download is unavailable");
  }
  return url.toString();
}

async function fetchUpdateTarget(): Promise<UpdateTarget | null> {
  const response = await fetch(RELEASES_LATEST, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Update service returned ${response.status}`);
  const release = (await response.json()) as LatestRelease;
  const version = release.tag_name || "";
  if (!version || !isNewer(version, __APP_VERSION__)) return null;
  try {
    return { version, apkUrl: apkDownloadUrl(release, version) };
  } catch {
    // Newer tag exists but this product's APK was not published (failed/partial release).
    throw new Error(`Release ${version} is published, but the ${__APP_PRODUCT__} APK is not available yet.`);
  }
}

async function openApk(apkUrl: string): Promise<void> {
  await Browser.open({ url: apkUrl });
}

function dismissedFor(version: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === version.replace(/^v/, "");
  } catch {
    return false;
  }
}

function rememberDismiss(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version.replace(/^v/, ""));
  } catch {
    /* ignore quota / private mode */
  }
}

function ensurePromptStyles(): void {
  if (document.getElementById("aimatic-update-prompt-style")) return;
  const style = document.createElement("style");
  style.id = "aimatic-update-prompt-style";
  style.textContent = `
    #aimatic-update-prompt{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483000;display:grid;gap:10px;padding:14px 16px;border-radius:14px;background:#102433;color:#f5fafc;box-shadow:0 12px 28px rgba(0,0,0,.35);font:inherit}
    #aimatic-update-prompt strong{font-size:1rem;font-weight:800}
    #aimatic-update-prompt p{margin:0;opacity:.9;line-height:1.35;font-size:.9rem}
    #aimatic-update-prompt .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #aimatic-update-prompt button{min-height:48px;padding:0 12px;border:0;border-radius:12px;font:inherit;font-weight:800;cursor:pointer}
    #aimatic-update-prompt button.primary{background:#0f9f8a;color:#04241e}
    #aimatic-update-prompt button.secondary{background:transparent;color:#f5fafc;border:1px solid rgba(255,255,255,.35)}
    #aimatic-update-prompt[hidden]{display:none!important}
  `;
  document.head.append(style);
}

function hidePrompt(): void {
  const root = document.getElementById("aimatic-update-prompt");
  if (root) root.hidden = true;
}

/** Non-blocking: app keeps working; user can update now or dismiss. */
function showUpdateAvailable(target: UpdateTarget): void {
  ensurePromptStyles();
  let root = document.getElementById("aimatic-update-prompt");
  if (!root) {
    root = document.createElement("div");
    root.id = "aimatic-update-prompt";
    root.setAttribute("role", "status");
    document.body.append(root);
  }
  root.hidden = false;
  root.innerHTML = `<strong>Update available</strong>
    <p>v${target.version.replace(/^v/, "")} is ready. You are on v${__APP_VERSION__}. You can keep using this version.</p>
    <div class="actions">
      <button type="button" class="secondary" data-update-later>Later</button>
      <button type="button" class="primary" data-update-now>Update</button>
    </div>
    <p data-update-status></p>`;
  const status = root.querySelector<HTMLElement>("[data-update-status]");
  root.querySelector<HTMLButtonElement>("[data-update-later]")!.onclick = () => {
    rememberDismiss(target.version);
    hidePrompt();
  };
  root.querySelector<HTMLButtonElement>("[data-update-now]")!.onclick = () => {
    if (status) status.textContent = "Opening the download…";
    void openApk(target.apkUrl).catch((error) => {
      if (status) status.textContent = error instanceof Error ? error.message : "Could not open the download.";
    });
  };
}

async function check(button: HTMLButtonElement, status: HTMLElement): Promise<void> {
  button.disabled = true;
  status.textContent = "Checking for updates…";
  try {
    const target = await fetchUpdateTarget();
    if (!target) {
      status.textContent = `You have the latest version (v${__APP_VERSION__}).`;
      hidePrompt();
      return;
    }
    status.textContent = `Update ${target.version} is available.`;
    showUpdateAvailable(target);
    await openApk(target.apkUrl);
  } catch (error) {
    status.textContent = `Could not check for updates. ${error instanceof Error ? error.message : "Please try again."}`;
  } finally {
    button.disabled = false;
  }
}

function mountOptionalButton(): void {
  if (__APP_PRODUCT__ === "stock-receiving") return;
  const targets = document.querySelectorAll<HTMLElement>(".setup-card, .cashier-login-tools");
  for (const target of targets) {
    if (target.querySelector("[data-android-update]")) continue;
    const wrap = document.createElement("div");
    wrap.dataset.androidUpdate = "";
    wrap.style.cssText = "margin:12px 0;text-align:center";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Check app update";
    button.style.cssText = "padding:10px 16px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.style.cssText = "font-size:0.85rem;margin:6px 0";
    button.addEventListener("click", () => void check(button, status));
    wrap.append(button, status);
    target.append(wrap);
  }
}

async function offerAvailableUpdate(): Promise<void> {
  try {
    const target = await fetchUpdateTarget();
    if (!target || dismissedFor(target.version)) return;
    showUpdateAvailable(target);
  } catch {
    // Never block the app when GitHub is down or a release APK is missing.
  }
}

mountOptionalButton();
new MutationObserver(mountOptionalButton).observe(document.body, { childList: true, subtree: true });
void offerAvailableUpdate();
