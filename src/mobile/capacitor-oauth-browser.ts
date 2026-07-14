import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { OAuthAuthorizationBrowser } from "./credential-provider";

export const capacitorOAuthBrowser: OAuthAuthorizationBrowser = {
  async authorize(url, redirectUri) {
    return new Promise<string>(async (resolve, reject) => {
      let settled = false;
      const finish = async (callback?: string, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        await listener.remove();
        await Browser.close().catch(() => undefined);
        if (error) reject(error); else resolve(callback!);
      };
      const listener = await App.addListener("appUrlOpen", ({ url: callback }) => {
        if (callback.startsWith(redirectUri)) void finish(callback);
      });
      const timeout = window.setTimeout(() => void finish(undefined, new Error("OAuth login timed out.")), 5 * 60_000);
      try { await Browser.open({ url, presentationStyle: "popover" }); }
      catch (error) { await finish(undefined, error instanceof Error ? error : new Error("Unable to open ERPNext login.")); }
    });
  }
};
