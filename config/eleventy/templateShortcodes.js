const siteData = require("../../_data/site.js");
const slugify = require("./slugify");
const { renderWebglModel } = require("./webglModelShortcodes");

const ONE_OFF_TEMPLATES = new Set(["gallery", "scrollbox", "quote"]);
const TEMPLATE_FIELD_GROUPS = siteData.template_field_groups || {};

function normalizeTemplateName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTemplateKey(name) {
  return normalizeTemplateName(name).replace(/[^a-z0-9]/g, "");
}

function templateIncludePath(name) {
  return `templates/${normalizeTemplateName(name).replace(/\s+/g, "-")}.njk`;
}

function templateIsOneOff(name) {
  return ONE_OFF_TEMPLATES.has(normalizeTemplateKey(name));
}

function resolveTemplateFieldGroups(site) {
  if (site && typeof site === "object" && site.template_field_groups && typeof site.template_field_groups === "object") {
    return site.template_field_groups;
  }
  return TEMPLATE_FIELD_GROUPS;
}

function groupsForTemplateType(fieldGroups, type) {
  if (!fieldGroups || typeof fieldGroups !== "object") return [];
  if (Array.isArray(fieldGroups[type])) return fieldGroups[type];
  for (const [rawKey, groups] of Object.entries(fieldGroups)) {
    if (normalizeTemplateKey(rawKey) === type && Array.isArray(groups)) return groups;
  }
  return [];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return "#";
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  if (/^\/wiki\//i.test(raw)) {
    const target = raw.replace(/^\/wiki\//i, "").replace(/^\/+|\/+$/g, "");
    return `/${slugify(target)}/`;
  }
  return raw;
}

function renderWikiLink(target, display) {
  const cleanTarget = String(target || "").trim();
  const label = String(display || cleanTarget);
  if (!cleanTarget) return escapeHtml(label);
  if (/^(wikipedia|wp):/i.test(cleanTarget)) {
    const page = cleanTarget.replace(/^(wikipedia|wp):/i, "").trim().replace(/\s+/g, "_");
    const href = `https://en.wikipedia.org/wiki/${encodeURIComponent(page)}`;
    return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }
  return `<a href="/${slugify(cleanTarget)}/">${escapeHtml(label)}</a>`;
}

function findTemplateByReference(templates, requestedType, requestedName) {
  const type = normalizeTemplateKey(requestedType);
  const name = String(requestedName || "").trim().toLowerCase();
  const list = Array.isArray(templates) ? templates : [];
  const candidates = list.filter((item) => normalizeTemplateKey(item?.template) === type);
  if (candidates.length === 0) return null;
  if (!name) return candidates[0];
  return candidates.find((item) => String(item?.name || item?.title || "").trim().toLowerCase() === name) || null;
}

function renderOneOffTemplate(template, templates, fieldGroups, depth = 0) {
  const type = normalizeTemplateKey(template?.template);
  if (type === "quote") {
    return `<blockquote class="wiki-template quote-template">${renderTemplateValue(template?.text || "", templates, fieldGroups, depth + 1)}</blockquote>`;
  }
  if (type === "scrollbox") {
    const label = escapeHtml(template?.name || template?.title || "Scroll");
    const items = Array.isArray(template?.items) ? template.items : [];
    const text = template?.text;
    let body = "";
    if (items.length > 0) {
      body = `<ul class="scroll-box-list">${items.map((item) => `<li>${renderTemplateValue(item, templates, fieldGroups, depth + 1)}</li>`).join("")}</ul>`;
    } else if (text != null && text !== "") {
      body = `<div class="scroll-box-text">${renderTemplateValue(text, templates, fieldGroups, depth + 1)}</div>`;
    }
    return `<section class="wiki-template scroll-box-template"><h3 class="template-heading">${label}</h3><div class="scroll-box-body">${body}</div></section>`;
  }
  if (type === "gallery") {
    const images = Array.isArray(template?.images) ? template.images : [];
    const body = images.map((image) => {
      const file = image?.file ? `/images/${encodeURI(String(image.file))}` : "";
      const caption = image?.caption ? `<figcaption>${renderTemplateValue(image.caption, templates, fieldGroups, depth + 1)}</figcaption>` : "";
      const img = file
        ? `<img src="${escapeHtml(file)}" alt="${escapeHtml(image?.caption || image?.file || "Gallery image")}" loading="lazy" />`
        : "";
      return `<figure class="gallery-item">${img}${caption}</figure>`;
    }).join("");
    return `<section class="wiki-template gallery-template"><div class="gallery-grid">${body}</div></section>`;
  }
  return "";
}

function renderTemplateImageFigure(template, templates, fieldGroups, depth = 0, { includeCaption = true } = {}) {
  const imagePath = String(template?.image || "").trim();
  if (!imagePath) return "";
  const heading = escapeHtml(template?.title || imagePath);
  const captionHtml = includeCaption && template?.caption
    ? `<figcaption>${renderTemplateValue(template.caption, templates, fieldGroups, depth + 1)}</figcaption>`
    : "";
  return `<figure class="template-image"><img src="/images/${escapeHtml(imagePath)}" alt="${heading}" loading="lazy" />${captionHtml}</figure>`;
}

function renderTemplateMediaCaption(template, templates, fieldGroups, depth = 0) {
  if (!template?.caption) return "";
  return `<figcaption class="template-media-caption">${renderTemplateValue(template.caption, templates, fieldGroups, depth + 1)}</figcaption>`;
}

function renderTemplateMediaViewer(template, templates, fieldGroups, depth = 0) {
  const imagePath = String(template?.image || "").trim();
  const modelName = String(template?.model || "").trim();
  const hasImage = Boolean(imagePath);
  const hasModel = Boolean(modelName);

  if (!hasImage && !hasModel) return "";

  if (hasImage && !hasModel) return renderTemplateImageFigure(template, templates, fieldGroups, depth);

  if (hasModel && !hasImage) {
    const modelHtml = renderWebglModel(modelName);
    if (!modelHtml) return "";
    return `<div class="template-media-viewer template-media-viewer--model-only">${modelHtml}${renderTemplateMediaCaption(template, templates, fieldGroups, depth)}</div>`;
  }

  const imageHtml = renderTemplateImageFigure(template, templates, fieldGroups, depth, { includeCaption: false });
  const modelHtml = renderWebglModel(modelName);
  if (!modelHtml) return renderTemplateImageFigure(template, templates, fieldGroups, depth);

  const defaultView = template?.default_view === "model" ? "model" : "image";
  const imageActive = defaultView === "image";
  const modelActive = defaultView === "model";
  const captionHtml = renderTemplateMediaCaption(template, templates, fieldGroups, depth);

  return `<div class="template-media-viewer" data-default-view="${escapeHtml(defaultView)}">
    <div class="template-media-controls btn-group btn-group-sm w-100" role="group" aria-label="Media view">
      <button type="button" class="btn btn-outline-dark template-media-btn${imageActive ? " is-active" : ""}" data-view="image" aria-pressed="${imageActive}">Image</button>
      <button type="button" class="btn btn-outline-dark template-media-btn${modelActive ? " is-active" : ""}" data-view="model" aria-pressed="${modelActive}">3D Model</button>
    </div>
    <div class="template-media-panels">
      <div class="template-media-panel" data-view="image"${modelActive ? " hidden" : ""}>${imageHtml}</div>
      <div class="template-media-panel" data-view="model"${imageActive ? " hidden" : ""}>${modelHtml}</div>
    </div>${captionHtml}
  </div>`;
}

function renderInfoTemplate(template, templates, fieldGroups, depth = 0) {
  const type = normalizeTemplateKey(template?.template);
  const heading = escapeHtml(template?.title || "");
  const media = renderTemplateMediaViewer(template, templates, fieldGroups, depth);
  const ignored = new Set(["template", "title", "image", "caption", "model", "default_view"]);
  const formatLabel = (key) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const allEntries = Object.entries(template || {}).filter(([key, val]) => !ignored.has(key) && val != null && val !== "");
  const grouped = groupsForTemplateType(fieldGroups, type);
  const used = new Set();
  const renderRows = (entries) => entries.map(([key, val]) => `<tr><th>${escapeHtml(formatLabel(key))}</th><td>${renderTemplateValue(val, templates, fieldGroups, depth + 1)}</td></tr>`).join("");

  const groupHtml = grouped.map(({ label, keys }) => {
    const keySet = new Set(keys || []);
    const entries = allEntries.filter(([key]) => keySet.has(key));
    if (entries.length === 0) return "";
    entries.forEach(([key]) => used.add(key));
    return `<details class="template-group" open><summary>${escapeHtml(label)}</summary><table class="template-table"><tbody>${renderRows(entries)}</tbody></table></details>`;
  }).join("");

  const remainder = allEntries.filter(([key]) => !used.has(key));
  const remainderHtml = grouped.length > 0 && remainder.length > 0
    ? `<details class="template-group" open><summary>Other</summary><table class="template-table"><tbody>${renderRows(remainder)}</tbody></table></details>`
    : "";
  const fallbackHtml = grouped.length === 0
    ? `<table class="template-table"><tbody>${renderRows(allEntries)}</tbody></table>`
    : "";

  return `<section class="wiki-template info-template">${heading ? `<h2 class="template-heading">${heading}</h2>` : ""}${media}${fallbackHtml}${groupHtml}${remainderHtml}</section>`;
}

function renderTemplateFromShortcode(templates, typeRaw, nameRaw, fieldGroups, depth = 0) {
  const type = normalizeTemplateKey(typeRaw);
  const template = findTemplateByReference(templates, type, nameRaw);
  if (!template) return null;
  if (ONE_OFF_TEMPLATES.has(type)) return renderOneOffTemplate(template, templates, fieldGroups, depth + 1);
  return renderInfoTemplate(template, templates, fieldGroups, depth + 1);
}

function replaceTemplateShortcodes(input, templates, fieldGroups, depth = 0) {
  if (input == null) return "";
  const text = String(input);
  if (depth > 5) return text;
  const shortcodePattern = /(?:\{\{|\[\[)\s*([^:\]}]+?)\s*:\s*([^\]}]+?)\s*(?:\}\}|\]\])/g;
  return text.replace(shortcodePattern, (match, typeRaw, nameRaw) => {
    const rendered = renderTemplateFromShortcode(templates, typeRaw, nameRaw, fieldGroups, depth + 1);
    return rendered || match;
  });
}

function renderTemplateValue(value, templates, fieldGroups, depth = 0) {
  if (value == null || value === "") return "";
  if (depth > 6) return escapeHtml(String(value));
  if (Array.isArray(value)) {
    return `<ul class="template-value-list">${value.map((item) => `<li>${renderTemplateValue(item, templates, fieldGroups, depth + 1)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return `<ul class="template-value-list">${entries.map(([key, val]) => `<li><strong>${escapeHtml(key.replace(/_/g, " "))}:</strong> ${renderTemplateValue(val, templates, fieldGroups, depth + 1)}</li>`).join("")}</ul>`;
  }

  let out = replaceTemplateShortcodes(String(value), templates, fieldGroups, depth + 1);
  out = out.replace(
    /\[([^\]\n]*?)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)\)/g,
    (_m, label, href) => `<a href="${escapeHtml(normalizeHref(href))}">${escapeHtml(label)}</a>`
  );
  out = out.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_m, target, display) => renderWikiLink(target, display));
  return out.replace(/\n/g, "<br>");
}

function renderTemplateValueWithSite(value, templates, site) {
  return renderTemplateValue(value, templates, resolveTemplateFieldGroups(site));
}

function renderBodyShortcodesWithSite(content, templates, site) {
  const fieldGroups = resolveTemplateFieldGroups(site);
  return replaceTemplateShortcodes(content, templates, fieldGroups).replace(
    /<p>\s*((?:<(?:section|blockquote)[\s\S]*?<\/(?:section|blockquote)>))\s*<\/p>/g,
    "$1"
  );
}

module.exports = {
  templateIncludePath,
  templateIsOneOff,
  renderTemplateValueWithSite,
  renderBodyShortcodesWithSite,
};
