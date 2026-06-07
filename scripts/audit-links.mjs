/**
 * Audit every link reference in content/ (markdown body + frontmatter).
 *
 * Produces a JSON report at scripts/link-audit.json with per-link entries:
 *   { file, line, kind, raw, label, target, classification, suggestion }
 *
 * Classifications:
 *   internal-match        link resolves to a real page on this site
 *   internal-fix          link needs rewriting to the page's full slug path
 *   internal-broken       /slug/ or /wiki/slug/ with no matching page
 *   wikipedia             link points to en.wikipedia.org (or should)
 *   external-fandom       link points to *.fandom.com
 *   external              any other absolute external URL
 *   asset                 image/file/anchor reference (left as-is)
 *   malformed             obvious syntactic problem (stray paren, etc.)
 *
 * Run: node scripts/audit-links.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content");

function slugify(str) {
  return String(str)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function* walkFiles(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "images") continue;
      yield* walkFiles(full);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      yield full;
    }
  }
}

function permalinkFor(relPosix) {
  // relPosix like "Celestial Objects/Planets/Super-Earths/Lizard-953-E.md"
  const noExt = relPosix.replace(/\.md$/, "");
  const segs = noExt.split("/");
  const isIndex = segs[segs.length - 1] === "index";
  const stemSegs = isIndex ? segs.slice(0, -1) : segs;
  if (stemSegs.length === 0) return "/";
  const slugged = stemSegs.map(slugify).join("/");
  return "/" + slugged + "/";
}

// ── Build the slug index ────────────────────────────────────────────────────
const allFiles = [...walkFiles(CONTENT)].map((abs) => ({
  abs,
  rel: path.relative(CONTENT, abs).split(path.sep).join("/"),
}));

const pageBySlugFull = new Map();   // full slug-path → page
const pageByLastSlug = new Map();   // last segment → [pages] (collisions tracked)
const pageByTitle = new Map();      // slugified title → [pages]

for (const f of allFiles) {
  const permalink = permalinkFor(f.rel);
  const fullSlug = permalink.replace(/^\/|\/$/g, "");
  const lastSeg = fullSlug.split("/").filter(Boolean).pop() || "";
  pageBySlugFull.set(fullSlug, { ...f, permalink });
  if (!pageByLastSlug.has(lastSeg)) pageByLastSlug.set(lastSeg, []);
  pageByLastSlug.get(lastSeg).push({ ...f, permalink });

  // Title (read frontmatter `title:`)
  const text = fs.readFileSync(f.abs, "utf8");
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    if (titleMatch) {
      const tSlug = slugify(titleMatch[1]);
      if (!pageByTitle.has(tSlug)) pageByTitle.set(tSlug, []);
      pageByTitle.get(tSlug).push({ ...f, permalink });
    }
  }
}

// ── Scan links ──────────────────────────────────────────────────────────────
const linkRegexes = [
  // Markdown link [label](target) - target may contain a single level of
  // balanced parens (e.g. `Io_(moon)`).
  { name: "md", re: /\[([^\]\n]*?)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)\)/g },
  // Wiki link [[Target]] or [[Target|Display]]
  { name: "wiki", re: /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g },
  // MediaWiki external [scheme://… label]
  { name: "mw-ext", re: /\[(\S+?:\/\/[^\s\]]+)\s+([^\]]+?)\]/g },
];

// Guard against the regex spuriously matching `prev_label](url) more_text [Y](url2)`
// in dense, prose-heavy content. A target that itself contains `](` was almost
// certainly produced by a misparse and should be ignored.
function targetLooksReal(target) {
  if (!target) return false;
  const t = String(target);
  if (t.includes("](")) return false;
  if (t.includes(" ") && !/^https?:\/\//.test(t)) return false;
  return true;
}

function classify(target) {
  const t = String(target || "").trim();
  if (!t) return { classification: "malformed", suggestion: null };

  // Anchor-only / mailto / data
  if (t.startsWith("#") || t.startsWith("mailto:") || t.startsWith("data:")) {
    return { classification: "asset", suggestion: null };
  }

  // Absolute external
  if (/^https?:\/\//i.test(t)) {
    if (/^https?:\/\/[^/]*wikipedia\.org\//i.test(t)) {
      return { classification: "wikipedia", suggestion: null };
    }
    if (/^https?:\/\/[^/]*fandom\.com\//i.test(t)) {
      return { classification: "external-fandom", suggestion: null };
    }
    return { classification: "external", suggestion: null };
  }

  // Image / asset references inside /images/ or /assets/
  if (t.startsWith("/images/") || t.startsWith("/assets/")) {
    return { classification: "asset", suggestion: null };
  }

  // Template shortcodes such as `[[scrollbox:Planets]]` share the wiki-link
  // bracket syntax but are not navigation links – the Eleventy build pipeline
  // expands them into HTML at render time. Skip them.
  const colonIdx = t.indexOf(":");
  if (colonIdx > 0 && !/^https?:|^mailto:/i.test(t)) {
    const ns = t.slice(0, colonIdx).toLowerCase();
    if (ns !== "wikipedia" && ns !== "wp") {
      return { classification: "shortcode", suggestion: null };
    }
  }

  // Relative or root-relative internal link
  // Normalize the candidate slug path by stripping /wiki/ prefix and trailing/leading /
  let raw = t.replace(/^\/+/, "").replace(/\/+$/, "");

  // Strip stray trailing characters like ) or .)
  raw = raw.replace(/[)\].,;:!?]+$/, "");

  let wasWiki = false;
  if (raw.startsWith("wiki/")) {
    wasWiki = true;
    raw = raw.slice("wiki/".length).replace(/^\/+|\/+$/g, "");
  }

  // Anchor on internal link
  let anchor = "";
  const hashIdx = raw.indexOf("#");
  if (hashIdx >= 0) {
    anchor = raw.slice(hashIdx);
    raw = raw.slice(0, hashIdx);
  }

  if (!raw) {
    return { classification: "asset", suggestion: null };
  }

  // Slugify each segment of the candidate path so that wiki-style targets like
  // "Serial Designation Y" or "Lizard-953-E" are normalized to lowercase slug form.
  raw = raw.split("/").filter(Boolean).map(slugify).join("/");

  if (!raw) {
    return { classification: "malformed", suggestion: null };
  }

  // Already nested? See if it matches a page directly
  if (pageBySlugFull.has(raw)) {
    const expected = "/" + raw + "/" + anchor;
    const original = "/" + (wasWiki ? "wiki/" : "") + raw + "/" + anchor;
    if (expected === original && !wasWiki) {
      return {
        classification: "internal-match",
        suggestion: null,
        target: pageBySlugFull.get(raw).permalink + anchor,
      };
    }
    return {
      classification: "internal-fix",
      suggestion: pageBySlugFull.get(raw).permalink + anchor,
      target: pageBySlugFull.get(raw).permalink + anchor,
    };
  }

  // Try last-segment lookup (e.g. /lizard-953-e/ or /wiki/lizard-953-e/).
  // Also try the "the-" prefixed variant so references like "Mun" or
  // "Humpties" still match local pages titled "The Mun" / "The Humpties".
  const lastSeg = raw.split("/").pop();
  let candidates = pageByLastSlug.get(lastSeg) || [];
  if (candidates.length === 0 && !lastSeg.startsWith("the-")) {
    candidates = pageByLastSlug.get("the-" + lastSeg) || [];
  }

  if (candidates.length === 1) {
    return {
      classification: "internal-fix",
      suggestion: candidates[0].permalink + anchor,
      target: candidates[0].permalink + anchor,
    };
  }

  if (candidates.length > 1) {
    return {
      classification: "internal-fix-ambiguous",
      suggestion: candidates.map((c) => c.permalink).join(" | "),
      candidates: candidates.map((c) => c.permalink),
    };
  }

  // Last attempt: title-based lookup (matches frontmatter title slug)
  const titleCandidates = pageByTitle.get(lastSeg) || [];
  if (titleCandidates.length === 1) {
    return {
      classification: "internal-fix",
      suggestion: titleCandidates[0].permalink + anchor,
      target: titleCandidates[0].permalink + anchor,
    };
  }
  if (titleCandidates.length > 1) {
    return {
      classification: "internal-fix-ambiguous",
      suggestion: titleCandidates.map((c) => c.permalink).join(" | "),
      candidates: titleCandidates.map((c) => c.permalink),
    };
  }

  return { classification: "internal-broken", suggestion: null };
}

function lineOf(text, idx) {
  return text.slice(0, idx).split("\n").length;
}

const report = {
  summary: {},
  byFile: {},
};

function addLink(rec) {
  const c = rec.classification;
  report.summary[c] = (report.summary[c] || 0) + 1;
  if (!report.byFile[rec.file]) report.byFile[rec.file] = [];
  report.byFile[rec.file].push(rec);
}

for (const f of allFiles) {
  const text = fs.readFileSync(f.abs, "utf8");
  // Split frontmatter
  let frontmatter = "";
  let body = text;
  const fmM = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (fmM) {
    frontmatter = fmM[0];
    body = text.slice(frontmatter.length);
  }

  // Helper that scans a chunk and produces records (line numbers relative to whole file)
  const scan = (chunk, lineOffset, region) => {
    for (const { name, re } of linkRegexes) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(chunk)) != null) {
        const start = m.index;
        const line = lineOf(chunk, start) + lineOffset;
        let label, target;
        if (name === "md") {
          [label, target] = [m[1], m[2]];
        } else if (name === "wiki") {
          [target, label] = [m[1], m[2] || m[1]];
        } else if (name === "mw-ext") {
          [target, label] = [m[1], m[2]];
        }
        if (!targetLooksReal(target)) continue;
        const cls = classify(target);
        addLink({
          file: f.rel,
          line,
          region,
          kind: name,
          raw: m[0],
          label,
          target,
          ...cls,
        });
      }
    }
  };

  const fmLines = frontmatter ? frontmatter.split("\n").length - 1 : 0;
  if (frontmatter) scan(frontmatter, 0, "frontmatter");
  scan(body, fmLines, "body");
}

// Sort summary for stable output
const orderedSummary = Object.fromEntries(
  Object.entries(report.summary).sort((a, b) => b[1] - a[1])
);
report.summary = orderedSummary;

const outPath = path.join(ROOT, "scripts", "link-audit.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("Summary:");
for (const [k, v] of Object.entries(orderedSummary)) {
  console.log(`  ${k.padEnd(26)} ${v}`);
}
console.log(`\nWrote ${outPath}`);
console.log(`Total files: ${allFiles.length}`);
console.log(`Total pages indexed: ${pageBySlugFull.size}`);
