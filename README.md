# Lizard-Planets Wiki

A static wiki site for fictional worlds, characters, and lore, built with [Eleventy](https://www.11ty.dev/) and deployed to GitHub Pages. This is a conversion project from MediaWiki source material to one that is compiled and served as a static website. The original site was hosted at a place that rhymes with "random" but the ads and annoying community were motivation to move away. Now I can provide a clean, original experience, without the clutter.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Static site generator | [Eleventy 3](https://www.11ty.dev/) (`@11ty/eleventy` ^3.1.2) |
| Templating | [Nunjucks](https://mozilla.github.io/nunjucks/) (`.njk` layouts) |
| Markdown processor | [markdown-it](https://github.com/markdown-it/markdown-it) |
| HTML post-processing | [cheerio](https://github.com/cheeriojs/cheerio) (table of contents injection) |
| CSS framework | [Bootstrap 5.3.3](https://getbootstrap.com/) (CDN) |
| Search | [Pagefind](https://pagefind.app/) static search index |
| Math rendering | [KaTeX 0.16](https://katex.org/) (CDN) |
| 3D models | WebGL 2 planet renderer (`assets/planet-renderer.js`) |
| Runtime | Node.js >= 20 |
| Hosting | GitHub Pages (via `.github/workflows/main.yml`) |

---

## Getting Started

```bash
npm install

# Development server with live reload
npm start

# Production build → dist/ plus dist/pagefind/
npm run build

# Regenerate category index pages
npm run generate:index
```

The development server is available at `http://localhost:8080` by default.

---

## Project Structure

```
lizardplanets/
├── _data/
│   └── site.js              # Global site config, nav menu, and infobox field groups
├── _includes/
│   ├── base.njk             # Root HTML shell (loads Bootstrap, KaTeX, global assets)
│   ├── nav.njk              # Top navigation bar
│   ├── footer.njk           # Page footer
│   ├── single.njk           # Default article layout
│   ├── category-index.njk   # Category listing layout
│   ├── all-pages.njk        # All-pages index layout
│   ├── webgl-model.njk      # Inline WebGL model embed markup
│   └── templates/           # Nunjucks partials for infobox rendering
├── assets/
│   ├── styles.css           # Site-wide custom CSS
│   ├── theme.js             # Theme toggle and other client-side JS
│   ├── webgl-model.js       # WebGL model registry and bootstrapping
│   ├── planet-renderer.js   # Shared WebGL 2 planet renderer
│   ├── template-media-viewer.js  # Image / 3D toggle for infobox media
│   ├── models/              # Per-planet model loaders and JSON configs
│   └── textures/            # Planet texture maps referenced by model JSON
├── config/
│   └── eleventy/
│       ├── slugify.js        # Shared URL slug helper
│       ├── navTree.js        # Builds the navTree collection from page categories
│       ├── toc.js            # Table-of-contents Cheerio transform
│       ├── templateShortcodes.js  # Infobox/template shortcode renderer
│       └── webglModelShortcodes.js  # {{ webgl: … }} shortcode renderer
├── content/                 # All wiki pages (Eleventy input root)
│   ├── content.11tydata.js  # Directory-wide defaults: layout, slugified permalinks
│   ├── index.md             # Home page
│   ├── 404.md
│   ├── all-pages.md
│   ├── Celestial Objects/
│   │   ├── Planets/         # Gas Giants, Super-Earths, Subearths, …
│   │   ├── Stars/           # Main Sequence, Pulsars, Red Giants
│   │   ├── Galaxies/        # Spiral, Elliptical
│   │   ├── Moons/
│   │   ├── Black Holes/
│   │   ├── Dwarf Planets/
│   │   └── Star Systems/
│   ├── Characters/
│   │   ├── Individuals/     # Protagonists, Deuteragonists, Antagonists, …
│   │   └── Species/         # Main Races, Lesser Races
│   ├── The Story/
│   ├── Policies/
│   └── Uncategorized/
├── scripts/
│   └── generate-category-index-md.mjs  # Auto-generates index.md files
├── dist/                    # Build output (generated, do not edit)
└── eleventy.config.js       # Eleventy entry point
```

---

## Navigation and Global Site Information

All global site information lives in **`_data/site.js`**:

| Key | Purpose |
|---|---|
| `title` | Site name shown in the browser tab and header |
| `description` | Site meta description |
| `language` | HTML `lang` attribute |
| `legal.textLicense` | License displayed in the footer for text content |
| `legal.imageLicense` | License displayed in the footer for images |
| `menu` | Hierarchical nav structure (see below) |
| `template_field_groups` | Defines the grouped rows shown in infobox templates |

### Adding and Editing Navigation

The `menu` object in `site.js` defines the top-level and dropdown structure of the navigation bar. Keys at the top level become nav dropdown headings; nested keys become sub-groups. You do not add individual pages here — pages appear automatically in the nav if their `categories` frontmatter matches the menu path.

```js
// _data/site.js
menu: {
  "Celestial Objects": {
    "Planets": {
      "Super-Earths": {},
      "Gas Giants": {}
    }
  },
  "Characters": { ... }
}
```

The nav is populated by the `navTree` Eleventy collection (`config/eleventy/navTree.js`), which reads each page's `categories` frontmatter and groups pages accordingly. Each dropdown shows up to **10 pages**; if there are more, a "More…" link points to the category index page.

---

## Frontmatter Reference

Every page is a Markdown file with a YAML front matter block between `---` delimiters.

### Required Fields

```yaml
---
title: My Page Title
categories:
  - Top Section:
      - Sub Section:
          - Leaf Category
---
```

The `categories` value must mirror the nesting used in `site.menu` for the page to appear in the navigation dropdown. A page with no matching category path will still build but won't appear in the nav.

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `layout` | string | Override the default layout (`single.njk`). Category indexes use `category-index.njk`. |
| `permalink` | string | Override the auto-generated URL slug. |
| `sort_order` | number | Higher values sort the page earlier within its nav group. |
| `categoryPath` | string | Set automatically on generated `index.md` files; used for "More…" links. |
| `categoryIndex` | boolean | Marks a page as a category index. |
| `templates` | list | Infobox/sidebar data — see [Templates](#templates) below. |

### TOC Frontmatter

These are supported but not currently required on any page; see [Table of Contents](#table-of-contents) below.

| Field | Default | Description |
|---|---|---|
| `tocMin` | `2` | Minimum heading level to include |
| `tocMax` | `4` | Maximum heading level to include |
| `tocOpen` | `true` | Whether the TOC `<details>` starts expanded |
| `tocSummary` | `"Contents"` | Label for the TOC toggle |
| `tocNavLabel` | `"Contents"` | Accessible label |

---

## Templates (Infoboxes and Sidebars)

Templates are the primary way to add structured data (infoboxes, galleries, scroll boxes, quotes) to a page. They are defined in the `templates` list in frontmatter and rendered into the page body using shortcodes.

### Defining a Template in Frontmatter

```yaml
templates:
  - template: Planetary Overview   # template type (case-insensitive)
    title: Lizard-953-E            # displayed heading and shortcode reference name
    image: lizard-953-e-10.jpg  # optional image (relative to /images/)
    model: lizard-953-e            # optional 3D model slug (see [3D Models](#3d-models-webgl))
    default_view: image            # optional: image (default) or model
    caption: Some caption text.
    # type-specific data fields:
    class: Terrestrial Exoplanet
    diameter: 22,967 km
    gravity: 1.89 g
    temperature: 77.97 °F
    system: "[[Lizard-953 System]]"
```

When an infobox includes both `image` and `model`, the build renders a media viewer with **Image** and **3D Model** toggle buttons. Set `default_view: model` to open on the 3D view. With only `model` (no `image`), the infobox shows the interactive model directly.

### Rendering a Template in the Page Body

Use a shortcode in the body of the Markdown file to render the template inline:

```
{{ templateType: Template Title }}
```

Both `{{…}}` and `[[…]]` delimiters are accepted.

**Examples:**

```
{{ Planetary Overview: Lizard-953-E }}
{{ Character: Aarynn }}
[[ Gallery: Sabsthaca Desert ]]
```

The shortcode finds the matching template by type and title and renders it as HTML. Unmatched `type: name` pairs are left in place for other processors (for example `{{ webgl: slug }}`).

### Infobox Media Fields

These optional keys on any infobox template control the header media area:

| Field | Description |
|---|---|
| `image` | Static image path relative to `/images/` |
| `model` | 3D model slug matching `assets/models/{slug}.js` |
| `default_view` | `image` (default) or `model` when both `image` and `model` are set |
| `caption` | Caption shown below the image, model, or media viewer |

### Template Types

**Infobox templates** (render as collapsible data tables):

| Type | Field Groups |
|---|---|
| `Planetary Overview` | Astrographical Info, Orbital, Atmosphere, Surface |
| `Character` | Profile, Traits, Relations |
| `Alien Info` | Identity, Biology, Relations |
| `Government` | State, Leadership, Institutions |
| `Drone Info` | Profile, Capabilities, History |
| `Ship Info` | Class, Specifications, Systems |
| `Star Info` | Classification, Physical, System |
| `Galactic Info` | Structure, Dynamics, Civilization |
| `Moon` / `Satellite Info` | Orbital, Physical, Environment |
| `Black Hole` | Core, Field, Usage |
| `Item` | Overview, Specifications, Status |

**Special templates** (render as distinct UI components):

| Type | Frontmatter Keys | Description |
|---|---|---|
| `Gallery` | `images` (list of `file` + `caption`) | Image grid |
| `Scroll Box` | `text` or `items` (list) | Collapsible scrollable box |
| `Quote` | `text` | Blockquote |

#### Gallery Example

```yaml
- template: Gallery
  title: Lizard-953-E
  name: Sabsthaca Desert       # used as the shortcode reference name
  images:
    - file: lizard-953-e.png
      caption: Sabscatha Desert
    - file: lizard-953-e-2.png
      caption: Sulphur Springs
```

```
{{ gallery: Sabsthaca Desert }}
```

#### Scroll Box Example

```yaml
- template: Scroll Box
  title: Lizardian Empire
  name: Planets
  items:
    - "[[Lizard-953-E]]"
    - "[[Lizard-7759]]"
```

```
{{ scrollbox: Planets }}
```

Field groups for each infobox type are configured in `template_field_groups` in `_data/site.js`. Fields not in any group are shown under an "Other" section automatically.

---

## 3D Models (WebGL)

Interactive planet models use a vanilla WebGL 2 renderer (`assets/planet-renderer.js`) driven by per-planet JSON configs. Models can be embedded inline in page bodies or attached to infobox templates via the `model` frontmatter field.

### Inline Shortcode

Place a model anywhere in the Markdown body:

```
{{ webgl: lizard-953-e }}
[[ webgl: lizard-953-e ]]
```

The slug is normalized with the same slugify rules used for page URLs (lowercase, spaces to hyphens). It must resolve to `[a-z0-9-]+` and match files under `assets/models/`.

### Model Assets

Each model consists of two files in `assets/models/`:

| File | Purpose |
|---|---|
| `{slug}.js` | Loader script that fetches the JSON config and registers the model with `WebGLModels` |
| `{slug}.json` | Planet renderer configuration (textures, atmosphere, camera, ring, etc.) |

Texture paths in the JSON are site-root URLs under `/assets/textures/` (for example `/assets/textures/lizard-953-e/tex-col.jpg`). Place the image files in `assets/textures/{slug}/`.

See `assets/models/lizard-953-e.js` and `assets/models/lizard-953-e.json` for a working example. The loader registers the model slug from the JSON `slug` field, which must match the shortcode and frontmatter value.

Models are excluded from Pagefind search indexing. Users can drag to rotate and scroll to zoom; a fullscreen control is available in the viewer.

---

## Shortcodes and Markdown Extensions

Beyond template shortcodes, several other Markdown extensions are applied automatically by the build pipeline:

### WebGL Model Shortcode

See [3D Models (WebGL)](#3d-models-webgl) above. Processed by the `renderWebglModels` filter after template shortcodes in `single.njk`.

### Wiki-Style Internal Links

```markdown
[[Page Title]]
[[Page Title|Display Text]]
```

Automatically resolved to slugified internal URLs. The page title is case-insensitive and spaces are handled.

### Wikipedia Links

```markdown
[[Wikipedia:Helium|Helium]]
[[wp:Carbon_dioxide|Carbon Dioxide]]
```

Rendered as external links to the English Wikipedia article.

### External Links (MediaWiki style)

```markdown
[https://example.com Link Label]
```

Converted to standard Markdown `[Link Label](https://example.com)`.

### Math (KaTeX)

Inline and display math are supported using standard LaTeX delimiters:

```markdown
Inline: $E = mc^2$

Display block:
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

KaTeX is loaded from CDN and rendered client-side.

### Table of Contents

Place `{{ toc }}` or `{% toc %}` on its own line in the body to insert a generated table of contents at that position:

```markdown
## My Article

{{ toc }}

## Section One
...
```

The TOC is built from the headings in the rendered page using Cheerio. The default includes `h2`–`h4`.

---

## Adding Content

1. Create a `.md` file in the appropriate `content/` subdirectory.
2. Add `title` and `categories` frontmatter. The `categories` nesting must match an existing path in `site.menu` to appear in the navigation.
3. Add `templates` frontmatter for any infoboxes or galleries, then reference them in the body with `{{ type: name }}` shortcodes. Optionally add `model` to an infobox or embed a standalone model with `{{ webgl: slug }}`.
4. To add a new category folder, add the path to `site.menu`, create the folder under `content/`, and run `npm run generate:index` to create its `index.md`.
5. To add a new 3D model, create `{slug}.js` and `{slug}.json` in `assets/models/`, add textures under `assets/textures/{slug}/`, and reference the slug in frontmatter or a `{{ webgl: slug }}` shortcode.

---

## Images

Place images under `content/images/`. In templates, the `image` field and gallery `file` entries are paths relative to `/images/` (e.g. `my-image.png` → `/images/my-image.png`).

---

## Deployment

Pushing to the `main` branch triggers the GitHub Actions workflow (`.github/workflows/main.yml`), which runs `npm ci && npm run build` and publishes the `dist/` folder to GitHub Pages.
