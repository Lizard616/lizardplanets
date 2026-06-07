const slugify = (str) =>
  String(str)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

module.exports = {
  layout: "single.njk",
  eleventyComputed: {
    // Walk templates[] to find the first usable image path.
    // Covers: infobox `image:` fields and gallery `images[0].file` entries.
    // Returns a root-relative path like /images/foo.png, or null.
    ogImage: (data) => {
      const templates = data.templates;
      if (!Array.isArray(templates)) return null;
      for (const t of templates) {
        if (t.image && typeof t.image === "string" && t.image.trim()) {
          const img = t.image.trim();
          return img.startsWith("/") ? img : `/images/${img}`;
        }
        if (Array.isArray(t.images) && t.images.length > 0 && t.images[0].file) {
          return `/images/${t.images[0].file}`;
        }
      }
      return null;
    },

    // Best available description: explicit frontmatter → infobox caption → null (falls back in template).
    ogDescription: (data) => {
      if (data.description) return data.description;
      const templates = data.templates;
      if (!Array.isArray(templates)) return null;
      for (const t of templates) {
        if (t.caption && typeof t.caption === "string" && t.caption.trim()) {
          const cap = t.caption.trim();
          return cap.length > 200 ? cap.slice(0, 197) + "…" : cap;
        }
      }
      return null;
    },

    // Produce clean, slugified output paths for all content pages.
    // Files with an explicit `permalink` in frontmatter are left untouched
    // because `data.permalink` will already carry that value when this runs.
    permalink: (data) => {
      if (data.permalink) return data.permalink;

      const stem = data.page.filePathStem; // e.g. "/Celestial Objects/…/index" or "/index"
      if (stem === "/index") return "/";

      // Category listings: …/index.md → parent directory URL (not …/index/)
      if (stem.endsWith("/index") && stem !== "/index") {
        const baseStem = stem.replace(/\/index$/, "");
        const slugged = baseStem
          .split("/")
          .map((seg) => (seg ? slugify(seg) : seg))
          .join("/");
        return slugged + "/";
      }

      const slugged = stem
        .split("/")
        .map((seg) => (seg ? slugify(seg) : seg))
        .join("/");

      return slugged + "/";
    },
  },
};
