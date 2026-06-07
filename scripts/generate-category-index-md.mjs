/**
 * Creates or refreshes index.md in every content subdirectory (except skipped
 * top-level folders like `images`). Intermediate dirs such as `Planets/` get
 * an index even when they only contain subfolders.
 * Run: node scripts/generate-category-index-md.mjs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content");
const SKIP_TOP = new Set(["images"]);

function* walkDirs(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const full = path.join(dir, ent.name);
    if (dir === CONTENT && SKIP_TOP.has(ent.name)) continue;
    yield full;
    yield* walkDirs(full);
  }
}

function titleFromPath(relPosix) {
  const parts = relPosix.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Index";
}

const yamlScalar = (s) => JSON.stringify(String(s));

let written = 0;

for (const dir of walkDirs(CONTENT)) {
  const rel = path.relative(CONTENT, dir);
  if (rel === "") continue;

  const categoryPath = rel.split(path.sep).join("/");
  const indexPath = path.join(dir, "index.md");
  const fm = `---
title: ${yamlScalar(titleFromPath(categoryPath))}
layout: category-index.njk
categoryPath: ${yamlScalar(categoryPath)}
categoryIndex: true
---

`;
  fs.writeFileSync(indexPath, fm, "utf8");
  written++;
}

console.log(`Wrote ${written} category index.md file(s).`);
