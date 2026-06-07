const path = require("path");
const nunjucks = require("nunjucks");
const slugify = require("./slugify");

const includesDir = path.join(__dirname, "../../_includes");
const env = nunjucks.configure(includesDir, { autoescape: true, trimBlocks: true, lstripBlocks: true });

const WEBGL_SHORTCODE = /(?:\{\{|\[\[)\s*webgl\s*:\s*([^\]}]+?)\s*(?:\}\}|\]\])/gi;

function normalizeModelName(name) {
  return slugify(String(name || "").trim());
}

function renderWebglModel(name) {
  const modelName = normalizeModelName(name);
  if (!modelName || !/^[a-z0-9-]+$/.test(modelName)) return "";
  const id = `webgl-${modelName}-${Math.random().toString(36).slice(2, 8)}`;
  return env.render("webgl-model.njk", { modelName, id });
}

function replaceWebglModelShortcodes(input) {
  if (input == null) return "";
  return String(input).replace(WEBGL_SHORTCODE, (_match, nameRaw) => renderWebglModel(nameRaw));
}

function renderWebglModelsWithSite(content) {
  let out = replaceWebglModelShortcodes(content);
  out = out.replace(
    /<p>\s*(<div class="webgl-model"[\s\S]*?<\/script>)\s*<\/p>/g,
    "$1"
  );
  return out;
}

module.exports = {
  renderWebglModel,
  renderWebglModelsWithSite,
};
