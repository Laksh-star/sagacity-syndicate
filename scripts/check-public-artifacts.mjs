import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import { readFileSync } from "node:fs";

import {
  PRIVATE_ONLY_PATHS,
  isPrivateOnlyPath,
  scanBinaryBuffer,
  scanTextLine,
} from "./public-artifact-rules.mjs";

const publicCandidate = process.argv.includes("--public-candidate");
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const privateOnly = tracked.filter(isPrivateOnlyPath);
const publicFiles = tracked.filter((file) => !isPrivateOnlyPath(file));
const violations = [];

if (publicCandidate) {
  for (const file of privateOnly) {
    violations.push(`${file} private-only path is present in a public candidate`);
  }
}

const textExtensions = new Set([
  ".css", ".example", ".html", ".js", ".jsx", ".json", ".md", ".mjs",
  ".cjs", ".svg", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const textNames = new Set([".env", ".gitignore", ".npmrc"]);
const imageExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function isTextFile(file) {
  const base = file.split("/").at(-1) ?? file;
  return textNames.has(base) || base.startsWith(".env.") || textExtensions.has(extname(file).toLowerCase());
}

for (const file of publicFiles) {
  if (!isTextFile(file)) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const label of scanTextLine(line)) {
      violations.push(`${file}:${index + 1} ${label}`);
    }
  }
}

const imageManifestPath = "scripts/public-image-review.json";
const manifest = JSON.parse(readFileSync(imageManifestPath, "utf8"));
const reviewedImages = new Set(manifest.reviewedImages?.map((entry) => entry.path) ?? []);

for (const file of publicFiles) {
  const extension = extname(file).toLowerCase();
  if (!imageExtensions.has(extension)) continue;
  if (!reviewedImages.has(file)) {
    violations.push(`${file} public image is missing from ${imageManifestPath}`);
  }
  for (const label of scanBinaryBuffer(readFileSync(file), extension)) {
    violations.push(`${file} ${label}`);
  }
}

for (const path of reviewedImages) {
  if (!tracked.includes(path)) violations.push(`${path} image review entry does not name a tracked file`);
  if (isPrivateOnlyPath(path)) violations.push(`${path} private-only image must not appear in the public image manifest`);
}

if (violations.length) {
  console.error("Public artifact hygiene check failed. Matched values are intentionally not printed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

const mode = publicCandidate ? "public candidate" : "private repository";
console.log(
  `Public artifact hygiene check passed for ${mode} (${publicFiles.length} public-scope files; ` +
  `${privateOnly.length} private-only files classified under ${PRIVATE_ONLY_PATHS.join(", ")}).`,
);
