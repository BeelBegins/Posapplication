import type { PosCoreDeps, ReleaseEntry } from "./types";
import { asRecord, textValue, getResponseError } from "./http";

const RELEASES_API = "https://api.github.com/repos/BeelBegins/Posapplication/releases";

/**
 * Release listing (GitHub Releases API, read-only). `installRelease` (download +
 * launch installer) stays in main.ts — it needs app.getPath/fs.writeFile/child_process,
 * all Electron/Node-native and not portable. `ghHeaders` is exported so main.ts's
 * installRelease can still share the same auth-header logic without duplicating it.
 */
export function createReleasesCore(deps: PosCoreDeps) {
  function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = (deps.db.getMeta("github_update_token") || "").trim();
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "erpnext-offline-pos", ...extra };
    if (token) headers.Authorization = `token ${token}`;
    return headers;
  }

  async function listReleases(): Promise<{ releases: ReleaseEntry[]; error: string | null }> {
    try {
      const response = await deps.fetch(`${RELEASES_API}?per_page=30`, { headers: ghHeaders() });
      if (!response.ok) return { releases: [], error: await getResponseError(response) };
      const body = await response.json() as unknown[];
      const releases: ReleaseEntry[] = [];
      for (const raw of Array.isArray(body) ? body : []) {
        const r = asRecord(raw); if (!r) continue;
        const assets = Array.isArray(r.assets) ? r.assets.map(asRecord).filter((a): a is Record<string, unknown> => Boolean(a)) : [];
        const exe = assets.find((a) => textValue(a, "name").toLowerCase().endsWith(".exe"));
        if (!exe) continue; // only releases that actually carry a Windows installer
        releases.push({
          tag: textValue(r, "tag_name"), version: textValue(r, "tag_name").replace(/^v/i, ""),
          name: textValue(r, "name") || textValue(r, "tag_name"), notes: textValue(r, "body"),
          publishedAt: textValue(r, "published_at") || textValue(r, "created_at"), prerelease: Boolean(r.prerelease),
          exeName: textValue(exe, "name"), exeUrl: textValue(exe, "browser_download_url"), exeApiUrl: textValue(exe, "url")
        });
      }
      return { releases, error: null };
    } catch (e) { return { releases: [], error: e instanceof Error ? e.message : "Unable to list releases." }; }
  }

  return { ghHeaders, listReleases };
}
