const { exec, execSync } = require("node:child_process");
const { getPathPrefix } = require("./config/eleventy/pathPrefix");
const slugify = require("./config/eleventy/slugify");
const { buildNavTree } = require("./config/eleventy/navTree");
const { TOC_PLACEHOLDER, injectTocHtml } = require("./config/eleventy/toc");
const {
  templateIncludePath,
  templateIsOneOff,
  renderTemplateValueWithSite,
  renderBodyShortcodesWithSite,
} = require("./config/eleventy/templateShortcodes");
const { renderWebglModelsWithSite } = require("./config/eleventy/webglModelShortcodes");

let pagefindChild = null;

module.exports = async function (eleventyConfig) {
  const { IdAttributePlugin } = await import("@11ty/eleventy");
  IdAttributePlugin(eleventyConfig);

  // Pagefind indexes dist/ after each Eleventy build (including --serve) so search
  // works locally without a separate `pagefind` step.
  eleventyConfig.on("eleventy.after", async ({ directories, runMode }) => {
    const outputDir = directories?.output || "dist";
    const cmd = `npx pagefind --site "${outputDir}"`;

    if (runMode === "serve" || runMode === "watch") {
      if (pagefindChild) {
        pagefindChild.kill();
        pagefindChild = null;
      }
      await new Promise((resolve) => {
        pagefindChild = exec(cmd, (err) => {
          pagefindChild = null;
          if (err && !err.killed) {
            console.error("[pagefind] Index build failed:", err.message);
          }
          resolve();
        });
      });
    } else {
      execSync(cmd, { stdio: "inherit" });
    }
  });

  // ── Preprocessors ────────────────────────────────────────────────────────
  eleventyConfig.addPreprocessor("math-protect", "md", (_data, content) => {
    const enc = (tex) => tex.trim().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    let out = content.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) =>
      `<span class="math-display" data-tex="${enc(tex)}"></span>`
    );
    out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex) =>
      `<span class="math-display" data-tex="${enc(tex)}"></span>`
    );
    out = out.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_m, tex) =>
      `<span class="math-inline" data-tex="${enc(tex)}"></span>`
    );
    return out;
  });

  // Standalone `---` lines are setext h2 underlines in CommonMark, not horizontal rules.
  // MediaWiki ---- rules are normalized to --- during import; convert them to <hr> instead.
  eleventyConfig.addPreprocessor("horizontal-rules", "md", (_data, content) =>
    content.replace(/^---\s*$/gm, "\n\n<hr>\n\n")
  );

  // `{{ toc }}` / `{% toc %}` on their own line.
  eleventyConfig.addPreprocessor("toc-shortcode", "md", (_data, content) => {
    let out = content.replace(/^\s*\{\{\s*toc\s*\}\}\s*$/gm, `\n\n${TOC_PLACEHOLDER}\n\n`);
    out = out.replace(/^\s*\{%\s*toc\s*%\}\s*$/gm, `\n\n${TOC_PLACEHOLDER}\n\n`);
    return out;
  });

  eleventyConfig.addPreprocessor("mediawiki-ext-links", "md", (_data, content) =>
    content.replace(
      /\[(https?:\/\/[^\s\]]+)\s+([^\]]+?)\]/g,
      (_m, url, label) => `[${label}](${url})`
    )
  );

  eleventyConfig.addPreprocessor("wiki-links", "md", (_data, content) =>
    content.replace(
      /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
      (_m, target, display) => `[${display || target}](/${slugify(target)}/)`
    )
  );

  // ── Static assets ────────────────────────────────────────────────────────
  eleventyConfig.addPassthroughCopy({ assets: "assets" });
  eleventyConfig.addPassthroughCopy({ "content/images": "images" });
  eleventyConfig.addWatchTarget("assets/**/*.{css,js}");
  eleventyConfig.addWatchTarget("assets/models/**/*.{js,json}");

  // ── Collections ──────────────────────────────────────────────────────────
  eleventyConfig.addCollection("navTree", (api) => buildNavTree(api));

  // ── Filters ──────────────────────────────────────────────────────────────
  eleventyConfig.addFilter("isArray", (val) => Array.isArray(val));
  eleventyConfig.addFilter("slugify", slugify);

  eleventyConfig.addFilter("categoryPathToUrl", (pathStr) => {
    if (!pathStr || typeof pathStr !== "string") return "/";
    const tail = pathStr
      .split("/")
      .map((s) => slugify(s))
      .filter(Boolean)
      .join("/");
    return "/" + tail + "/";
  });

  eleventyConfig.addFilter("pagesUnderContentPath", (collection, categoryPath) => {
    if (!collection || !categoryPath) return [];
    const norm = String(categoryPath).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const prefix = "/" + norm.split("/").join("/") + "/";
    return collection
      .filter((item) => {
        const stem = item.page?.filePathStem;
        if (!stem || item.data?.categoryIndex) return false;
        return stem.startsWith(prefix) && !stem.endsWith("/index");
      })
      .sort((a, b) =>
        String(a.data?.title ?? "").localeCompare(String(b.data?.title ?? ""))
      );
  });

  eleventyConfig.addFilter(
    "hasKeys",
    (obj) =>
      obj !== null &&
      typeof obj === "object" &&
      !Array.isArray(obj) &&
      Object.keys(obj).length > 0
  );

  eleventyConfig.addFilter("templateIncludePath", templateIncludePath);
  eleventyConfig.addFilter("templateIsOneOff", templateIsOneOff);
  eleventyConfig.addFilter("renderTemplateValue", function (value, templates) {
    return renderTemplateValueWithSite(value, templates, this?.ctx?.site);
  });
  eleventyConfig.addFilter("renderBodyShortcodes", function (content, templates) {
    return renderBodyShortcodesWithSite(content, templates, this?.ctx?.site);
  });
  eleventyConfig.addFilter("renderWebglModels", function (content) {
    return renderWebglModelsWithSite(content);
  });

  // ── Shortcodes / transforms ──────────────────────────────────────────────
  eleventyConfig.addShortcode("toc", () => TOC_PLACEHOLDER);
  eleventyConfig.addTransform("eleventy-toc", async function (content) {
    const outPath = this.outputPath || "";
    if (!outPath.endsWith(".html")) return content;
    if (!content.includes("data-eleventy-toc")) return content;
    return injectTocHtml(content, this.page?.data || {});
  });

  eleventyConfig.addGlobalData("sitePathPrefix", getPathPrefix());

  // Prefix root-relative URLs for GitHub Pages project sites.
  eleventyConfig.addTransform("prefix-root-urls", function (content) {
    const prefix = getPathPrefix();
    if (prefix === "/") return content;
    const outPath = this.outputPath || "";
    if (!outPath.endsWith(".html")) return content;
    const base = prefix.slice(0, -1);
    const baseSegment = base.slice(1);
    const skipPrefix = baseSegment
      ? `(?:\\/|${baseSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/)`
      : "\\/";
    const attrPattern = new RegExp(
      `(\\s(?:href|src|content)=["'])/(?!(?:${skipPrefix}))`,
      "g"
    );
    const urlPattern = new RegExp(`url\\((["']?)/(?!(?:${skipPrefix}))`, "g");
    let out = content.replace(attrPattern, `$1${base}/`);
    out = out.replace(urlPattern, `url($1${base}/`);
    return out;
  });

  return {
    pathPrefix: getPathPrefix(),
    dir: {
      input: "content",
      includes: "../_includes",
      data: "../_data",
      output: "dist",
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
  };
};
