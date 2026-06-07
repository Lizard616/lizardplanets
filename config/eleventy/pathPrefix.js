/** GitHub Pages project sites are served from a subpath (e.g. /lizardplanets/). */
function getPathPrefix() {
  const raw = (process.env.PATH_PREFIX || "/").trim();
  if (!raw || raw === "/") return "/";
  let prefix = raw;
  if (!prefix.startsWith("/")) prefix = `/${prefix}`;
  if (!prefix.endsWith("/")) prefix = `${prefix}/`;
  return prefix;
}

function prefixUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || raw.startsWith("#")) {
    return raw;
  }

  const prefix = getPathPrefix();
  if (prefix === "/") {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }

  const base = prefix.slice(0, -1);
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized === "/") return `${base}/`;
  if (normalized.startsWith(`${base}/`)) return normalized;
  return `${base}${normalized}`;
}

module.exports = { getPathPrefix, prefixUrl };
