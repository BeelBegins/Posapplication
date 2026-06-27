const fs = require("node:fs");

const owner = "BeelBegins";
const repo = "Posapplication";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tag = `v${pkg.version}`;
const token = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();

if (!token) {
  console.error("GH_TOKEN or GITHUB_TOKEN is required to publish the GitHub release.");
  process.exit(1);
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "erpnext-offline-pos-release",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message = body && typeof body === "object" && body.message ? body.message : text;
    throw new Error(`GitHub API ${response.status}: ${message}`);
  }

  return body;
}

(async () => {
  const release = await github(`/releases/tags/${encodeURIComponent(tag)}`);
  const published = await github(`/releases/${release.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      draft: false,
      prerelease: false,
      make_latest: "true",
    }),
  });

  console.log(`Published GitHub release ${published.tag_name}: ${published.html_url}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
