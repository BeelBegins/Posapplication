const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const profiles = JSON.parse(fs.readFileSync(path.join(root, "src", "config", "product-profiles.json"), "utf8"));

function loadProductProfile(id = process.env.AI_MATIC_PRODUCT || "pos", platform) {
  const profile = profiles[id];
  if (!profile) throw new Error(`Unknown Ai Matic product profile: ${id}`);
  if (!profile.enabled) throw new Error(`${profile.name} is reserved for a later development phase.`);
  if (platform && !profile.platforms.includes(platform)) throw new Error(`${profile.name} does not support ${platform}.`);
  return profile;
}

module.exports = { loadProductProfile, profiles };
