#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const errors = [];
const guide = fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");
const lines = guide.split(/\r?\n/).length;
if (lines > 200) errors.push(`CLAUDE.md has ${lines} lines (limit 200)`);
for (const phrase of ["2,000 transactions", "Every push to `main`", "pos-client-development", "product-client-development"]) {
  if (!guide.includes(phrase)) errors.push(`missing root invariant: ${phrase}`);
}
for (const name of ["pos-client-development", "product-client-development", "posapplication-release"]) {
  const file = path.join(root, ".claude", "skills", name, "SKILL.md");
  if (!fs.existsSync(file)) {
    errors.push(`missing skill: ${name}`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  if (!text.startsWith(`---\nname: ${name}\ndescription:`)) errors.push(`invalid skill frontmatter: ${name}`);
}
if (!fs.existsSync(path.join(root, "docs", "ai-guidance-archive-2026-07-28.md"))) errors.push("missing lossless guidance archive");
if (!fs.lstatSync(path.join(root, "AGENTS.md")).isSymbolicLink()) errors.push("AGENTS.md must symlink to CLAUDE.md");
if (!fs.lstatSync(path.join(root, ".agents", "skills")).isSymbolicLink()) errors.push(".agents/skills must be a symlink");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
console.log(`guidance root: ${lines} lines; package version: ${version}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("Posapplication guidance audit passed");
