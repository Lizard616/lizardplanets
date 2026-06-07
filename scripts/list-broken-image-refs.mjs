#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const IMAGES = path.join(CONTENT, "images");

function splitFrontmatter(src) {
  if (!src.startsWith("---")) return null;
  const end = src.indexOf("\n---", 3);
  if (end === -1) return null;
  return { fm: src.slice(4, end).replace(/^\r?\n/, "") };
}

function collectRefs(data) {
  const out = [];
  const templates = data?.templates;
  if (!Array.isArray(templates)) return out;
  for (const t of templates) {
    if (!t || typeof t !== "object") continue;
    if (t.image && String(t.image).trim()) {
      out.push({ kind: "image", ref: String(t.image).trim() });
    }
    const tname = String(t.template ?? "")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (tname === "gallery" && Array.isArray(t.images)) {
      for (const g of t.images) {
        if (g?.file && String(g.file).trim()) {
          out.push({ kind: "gallery", ref: String(g.file).trim() });
        }
      }
    }
  }
  return out;
}

async function exists(rel) {
  if (!rel || rel.includes("..")) return false;
  const norm = rel.replaceAll("\\", "/").replace(/^\/+/, "");
  const p = path.join(IMAGES, ...norm.split("/"));
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function* walkMd(dir) {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walkMd(p);
    else if (ent.isFile() && ent.name.endsWith(".md")) yield p;
  }
}

const brokenByArticle = new Map();

for await (const mdPath of walkMd(CONTENT)) {
  const raw = await fs.readFile(mdPath, "utf8");
  const sp = splitFrontmatter(raw);
  if (!sp) continue;
  let data;
  try {
    data = yaml.load(sp.fm) ?? {};
  } catch {
    continue;
  }
  const bad = [];
  for (const { kind, ref } of collectRefs(data)) {
    if (!ref) continue;
    if (await exists(ref)) continue;
    bad.push({ kind, ref });
  }
  if (bad.length) {
    brokenByArticle.set(path.relative(CONTENT, mdPath), bad);
  }
}

const sorted = [...brokenByArticle.entries()].sort((a, b) =>
  a[0].localeCompare(b[0]),
);

for (const [article, refs] of sorted) {
  const bits = refs.map((r) => `${r.kind}:${JSON.stringify(r.ref)}`);
  console.log(`${article}\t${bits.join("; ")}`);
}

console.error(`\nTotal: ${sorted.length} articles with broken refs.`);
