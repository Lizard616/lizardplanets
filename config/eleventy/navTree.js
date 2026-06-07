function extractCategoryPaths(categories) {
  function walk(entry, prefix) {
    if (typeof entry === "string") return [[...prefix, entry]];
    if (typeof entry === "object" && entry !== null) {
      const [key, val] = Object.entries(entry)[0];
      const next = [...prefix, key];
      if (!val || (Array.isArray(val) && val.length === 0)) return [next];
      if (Array.isArray(val)) return val.flatMap((sub) => walk(sub, next));
    }
    return [];
  }
  return (categories || []).flatMap((cat) => walk(cat, []));
}

function sortPagesForNav(a, b) {
  const sa = a.data.sort_order;
  const sb = b.data.sort_order;
  if (sa != null && sb != null) return sb - sa;
  if (sa != null) return -1;
  if (sb != null) return 1;
  return (a.data.title ?? "").localeCompare(b.data.title ?? "");
}

function buildNavTree(api, navThreshold = 10) {
  const tree = {};

  for (const page of api.getAll()) {
    if (page.data.eleventyExcludeFromCollections) continue;
    if (page.data.categoryIndex) continue;
    const paths = extractCategoryPaths(page.data.categories);
    for (const path of paths) {
      const key = path.join("/");
      if (!tree[key]) tree[key] = { primary: [], more: [] };
      tree[key].primary.push(page);
    }
  }

  for (const node of Object.values(tree)) {
    const all = node.primary;
    all.sort(sortPagesForNav);

    if (all.length > navThreshold) {
      node.primary = all.slice(0, navThreshold);
      node.more = all.slice(navThreshold);
    } else {
      node.primary = all;
      node.more = [];
    }
  }

  return tree;
}

module.exports = {
  buildNavTree,
};
