import { Browser } from "@capacitor/browser";

declare const __APP_VERSION__: string;
declare const __APP_PRODUCT__: string;

const assetNames: Record<string, string> = {
  pos: "Aimatic-POS-App-", restaurant: "Aimatic-Restaurant-App-",
  sales: "Aimatic-Sales-App-", shopping: "Aimatic-Shopping-App-",
  "stock-receiving": "Aimatic-Stock-Receiving-App-", hr: "Aimatic-HR-App-"
};

function isNewer(candidate: string, current: string): boolean {
  const parse = (value: string) => /^v?\d+(?:\.\d+)*$/.test(value) ? value.replace(/^v/, "").split(".").map(Number) : [];
  const a = parse(candidate), b = parse(current);
  if (!a.length || !b.length) throw new Error("Invalid release version");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function check(button: HTMLButtonElement, status: HTMLElement): Promise<void> {
  button.disabled = true;
  status.textContent = "Checking for updates…";
  try {
    const response = await fetch("https://api.github.com/repos/BeelBegins/Posapplication/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`Update service returned ${response.status}`);
    const release = await response.json() as { tag_name?: string; assets?: Array<{ name?: string; browser_download_url?: string }> };
    const version = release.tag_name || "";
    if (!isNewer(version, __APP_VERSION__)) { status.textContent = `You have the latest version (v${__APP_VERSION__}).`; return; }
    const expected = `${assetNames[__APP_PRODUCT__]}${version.replace(/^v/, "")}.apk`;
    const asset = release.assets?.find((item) => item.name === expected);
    const url = new URL(asset?.browser_download_url || "");
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith("/BeelBegins/Posapplication/releases/download/")) throw new Error("The APK download is unavailable");
    status.textContent = `Opening download for ${version}. Android will ask you to install it.`;
    await Browser.open({ url: url.toString() });
  } catch (error) {
    status.textContent = `Could not check for updates. ${error instanceof Error ? error.message : "Please try again."}`;
  } finally { button.disabled = false; }
}

function mount(): void {
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

if (__APP_PRODUCT__ !== "stock-receiving") {
  mount();
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
}
