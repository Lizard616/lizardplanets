const TOC_PLACEHOLDER = '<div data-eleventy-toc></div>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTocTree(items) {
  const root = { level: 0, children: [] };
  const stack = [root];

  for (const item of items) {
    const node = {
      level: item.level,
      id: item.id,
      text: item.text,
      children: [],
    };
    while (stack.length > 1 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function renderTocNodes(nodes) {
  if (!nodes?.length) return "";
  let html = "<ul>";
  for (const n of nodes) {
    html += `<li><a href="#${escapeHtml(n.id)}">${escapeHtml(n.text)}</a>`;
    if (n.children?.length) html += renderTocNodes(n.children);
    html += "</li>";
  }
  html += "</ul>";
  return html;
}

async function injectTocHtml(content, pageData) {
  const { load } = await import("cheerio");
  const tocMin = Number(pageData?.tocMin ?? 2);
  const tocMax = Number(pageData?.tocMax ?? 6);
  const tocOpen = pageData?.tocOpen !== false;
  const summary = String(pageData?.tocSummary ?? "Contents");
  const navLabel = String(pageData?.tocNavLabel ?? "On this page");

  const $ = load(content);
  const slots = $("[data-eleventy-toc]");
  if (!slots.length) return content;

  slots.each((_, slotEl) => {
    const $slot = $(slotEl);
    const $article = $slot.closest("article.wiki-article");
    const $scope = $article.length ? $article.find(".wiki-body").first() : $(".wiki-body").first();
    if (!$scope.length) {
      $slot.remove();
      return;
    }

    const items = [];
    $scope.find("h1, h2, h3, h4, h5, h6").each((__, el) => {
      const $h = $(el);
      if ($h.hasClass("template-heading")) return;
      if ($h.hasClass("wiki-title")) return;
      if ($h.closest("[data-eleventy-toc]").length) return;

      const level = parseInt(String($h.prop("tagName") || "").replace(/^H/i, ""), 10);
      if (Number.isNaN(level) || level < tocMin || level > tocMax) return;

      const id = $h.attr("id");
      if (!id) return;

      const text = $h.text().replace(/\s+/g, " ").trim();
      items.push({ level, id, text });
    });

    if (!items.length) {
      $slot.remove();
      return;
    }

    const tree = buildTocTree(items);
    const navHtml = renderTocNodes(tree);
    const openAttr = tocOpen ? " open" : "";
    const detailsHtml = `<details class="wiki-toc"${openAttr}><summary>${escapeHtml(
      summary
    )}</summary><nav class="wiki-toc-nav" aria-label="${escapeHtml(navLabel)}">${navHtml}</nav></details>`;

    $slot.replaceWith(detailsHtml);
  });

  return $.html();
}

module.exports = {
  TOC_PLACEHOLDER,
  injectTocHtml,
};
