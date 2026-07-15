import type { OAuthAuthorizationBrowser } from "../mobile/credential-provider";

const messageType = "aimatic-oauth-callback";

export function completePopupOAuthCallback(locationUrl = globalThis.location.href): boolean {
  const url = new URL(locationUrl);
  if (!globalThis.opener || (!url.searchParams.has("code") && !url.searchParams.has("error"))) return false;
  globalThis.opener.postMessage({ type: messageType, url: locationUrl }, url.origin);
  globalThis.close();
  return true;
}

export const webOAuthBrowser: OAuthAuthorizationBrowser = {
  authorize(url, redirectUri) {
    return new Promise<string>((resolve, reject) => {
      const redirect = new URL(redirectUri);
      const popup = globalThis.open(url, "aimatic-customer-login", "popup,width=520,height=720");
      if (!popup) return reject(new Error("Allow popups to sign in."));
      const timeout = globalThis.setTimeout(() => finish(undefined, new Error("OAuth login timed out.")), 5 * 60_000);
      const poll = globalThis.setInterval(() => { if (popup.closed) finish(undefined, new Error("Sign-in window was closed.")); }, 500);
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== redirect.origin || event.source !== popup) return;
        const data = event.data as { type?: string; url?: string };
        if (data?.type === messageType && data.url?.startsWith(redirectUri)) finish(data.url);
      };
      const finish = (callback?: string, error?: Error) => {
        globalThis.clearTimeout(timeout);
        globalThis.clearInterval(poll);
        globalThis.removeEventListener("message", onMessage);
        if (!popup.closed) popup.close();
        if (error) reject(error); else resolve(callback!);
      };
      globalThis.addEventListener("message", onMessage);
    });
  }
};
