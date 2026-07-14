const fs = require("node:fs");
const path = require("node:path");

const owner = "BeelBegins";
const repo = "Posapplication";
const outputDir = "dist-installer";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tag = `v${pkg.version}`;
const token = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--help");
const requireApk = process.argv.includes("--require-apk");

if (!dryRun && !token) {
  console.error("GH_TOKEN or GITHUB_TOKEN is required to publish the GitHub release.");
  process.exit(1);
}

const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const uploadBase = `https://uploads.github.com/repos/${owner}/${repo}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function shouldRetry(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function request(url, options = {}, attempt = 1) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "aimatic-pos-app-release",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    const body = parseJson(text);

    if (!response.ok) {
      const message = body && typeof body === "object" && body.message ? body.message : text;
      const error = new Error(`GitHub API ${response.status}: ${message}`);
      error.status = response.status;
      error.body = body;
      if (attempt < 4 && shouldRetry(response.status)) {
        await sleep(1500 * attempt);
        return request(url, options, attempt + 1);
      }
      throw error;
    }

    return body;
  } catch (error) {
    if (!error.status && attempt < 4) {
      await sleep(1500 * attempt);
      return request(url, options, attempt + 1);
    }
    throw error;
  }
}

function github(pathName, options) {
  return request(`${apiBase}${pathName}`, options);
}

async function getOrCreateRelease() {
  try {
    return await github(`/releases/tags/${encodeURIComponent(tag)}`);
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  return github("/releases", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      draft: true,
      prerelease: false,
    }),
  });
}

function expectedAssets() {
  const latestPath = path.join(outputDir, "latest.yml");
  if (!fs.existsSync(latestPath)) {
    throw new Error(`${latestPath} was not generated.`);
  }

  const latest = fs.readFileSync(latestPath, "utf8");
  const pathMatch = latest.match(/^path:\s*(.+)$/m);
  const urlMatch = latest.match(/^\s*-\s*url:\s*(.+)$/m) || latest.match(/^url:\s*(.+)$/m);
  const installerName = (pathMatch || urlMatch || [])[1];

  if (!installerName) {
    throw new Error("Could not read installer file name from dist-installer/latest.yml.");
  }

  const names = [installerName.trim(), `${installerName.trim()}.blockmap`, "latest.yml"];
  const assets = names.map((name) => {
    const filePath = path.join(outputDir, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`${filePath} is missing. Rebuild the installer before publishing.`);
    }
    return { name, filePath };
  });

  const apkName = `Aimatic-POS-App-${pkg.version}.apk`;
  const apkPath = path.join("dist-apk", apkName);
  if (fs.existsSync(apkPath)) {
    assets.push({ name: apkName, filePath: apkPath });
  } else if (requireApk) {
    throw new Error(`${apkPath} is missing. Build the signed Android release before publishing.`);
  }
  return assets;
}

async function deleteExistingAssets(releaseId, names) {
  const assets = await github(`/releases/${releaseId}/assets?per_page=100`);
  for (const asset of assets || []) {
    if (names.includes(asset.name)) {
      console.log(`Replacing existing release asset ${asset.name}`);
      await github(`/releases/assets/${asset.id}`, { method: "DELETE" });
    }
  }
}

function contentType(name) {
  if (name.endsWith(".yml")) {
    return "application/x-yaml";
  }
  if (name.endsWith(".blockmap")) {
    return "application/octet-stream";
  }
  if (name.endsWith(".exe")) {
    return "application/vnd.microsoft.portable-executable";
  }
  if (name.endsWith(".apk")) {
    return "application/vnd.android.package-archive";
  }
  return "application/octet-stream";
}

async function uploadAsset(releaseId, asset, attempt = 1) {
  const bytes = fs.readFileSync(asset.filePath);
  const url = `${uploadBase}/releases/${releaseId}/assets?name=${encodeURIComponent(asset.name)}`;

  try {
    const uploaded = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": contentType(asset.name),
        "Content-Length": String(bytes.length),
      },
      body: bytes,
    });
    console.log(`Uploaded ${uploaded.name}`);
  } catch (error) {
    if (attempt < 4 && (error.status === 422 || !error.status || shouldRetry(error.status))) {
      await deleteExistingAssets(releaseId, [asset.name]);
      await sleep(1500 * attempt);
      return uploadAsset(releaseId, asset, attempt + 1);
    }
    throw error;
  }
}

(async () => {
  const assets = expectedAssets();
  if (dryRun) {
    console.log(`Release ${tag} would publish these assets:`);
    for (const asset of assets) {
      const size = fs.statSync(asset.filePath).size;
      console.log(`- ${asset.name} (${size} bytes)`);
    }
    return;
  }

  const release = await getOrCreateRelease();
  const names = assets.map((asset) => asset.name);

  await deleteExistingAssets(release.id, names);
  for (const asset of assets) {
    await uploadAsset(release.id, asset);
  }

  const published = await github(`/releases/${release.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
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
