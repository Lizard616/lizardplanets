#!/usr/bin/env python3
"""Normalize YAML frontmatter in content/*.md per wiki conventions."""
from __future__ import annotations

import re
import sys
from io import StringIO
from pathlib import Path

from ruamel.yaml import YAML

TOP_PRIORITY = ["title", "published", "sort_order", "categories", "templates"]
# Discriminator first: each list entry is one infobox (Character, Gallery, etc.).
TEMPLATE_PRIORITY = ["template", "title", "image", "caption"]
# Gallery infobox: type, then display name, then image list; remaining keys A–Z.
GALLERY_TEMPLATE_PRIORITY = ["template", "name", "images"]
# Scroll Box infobox: type, then title, then item list; remaining keys A–Z.
SCROLL_BOX_TEMPLATE_PRIORITY = ["template", "name", "items"]
# Each object under Gallery.images: filename then caption; remaining keys A–Z.
GALLERY_IMAGE_PRIORITY = ["file", "caption"]


def is_probably_list_or_structured(s: str) -> bool:
    if re.search(r"^\s*[-*+]\s+\S", s, re.M):
        lines = [ln for ln in s.splitlines() if ln.strip()]
        bulletish = sum(1 for ln in lines if re.match(r"^\s*[-*+]\s", ln))
        if bulletish >= 2:
            return True
        if bulletish == 1 and len(lines) > 4:
            return True
    if s.count("|") >= 8:
        return True
    if re.search(r"^\s*\d+\.\s", s, re.M):
        return True
    return False


def ensure_descriptive_period(s: str) -> str:
    if len(s) < 60:
        return s
    if is_probably_list_or_structured(s):
        return s
    t = s.rstrip()
    if not t:
        return s
    if t[-1] in ".!?":
        return s
    if t.endswith("..."):
        return s
    if re.match(r"^https?://", t):
        return s
    if t.count("[[") >= 4:
        return s
    return s + "."


def reorder_mapping_keys(mapping: dict, priority: list[str], *, sort_rest: bool) -> dict:
    new: dict = {}
    for k in priority:
        if k in mapping:
            new[k] = mapping[k]
    rest_keys = [k for k in mapping.keys() if k not in priority]
    if sort_rest:
        rest_keys = sorted(rest_keys, key=str)
    for k in rest_keys:
        new[k] = mapping[k]
    return new


def process_node(node):
    if isinstance(node, dict):
        return {k: process_node(v) for k, v in node.items()}
    if isinstance(node, list):
        return [process_node(x) for x in node]
    if isinstance(node, str):
        return ensure_descriptive_period(node)
    return node


def _is_gallery_template(template_val) -> bool:
    return isinstance(template_val, str) and template_val.strip() == "Gallery"


def _is_scroll_box_template(template_val) -> bool:
    return isinstance(template_val, str) and template_val.strip() == "Scroll Box"


def process_gallery_images(node):
    if not isinstance(node, list):
        return process_node(node)
    out = []
    for el in node:
        if isinstance(el, dict):
            inner = {k: process_node(v) for k, v in el.items()}
            out.append(reorder_mapping_keys(inner, GALLERY_IMAGE_PRIORITY, sort_rest=True))
        else:
            out.append(process_node(el))
    return out


def process_template_item_dict(item: dict) -> dict:
    tmpl = item.get("template")
    is_gallery = _is_gallery_template(tmpl)
    is_scroll_box = _is_scroll_box_template(tmpl)
    d = {}
    for kk, vv in item.items():
        if is_gallery and kk == "images":
            d[kk] = process_gallery_images(vv)
        else:
            d[kk] = process_node(vv)
    if is_gallery:
        priority = GALLERY_TEMPLATE_PRIORITY
    elif is_scroll_box:
        priority = SCROLL_BOX_TEMPLATE_PRIORITY
    else:
        priority = TEMPLATE_PRIORITY
    return reorder_mapping_keys(d, priority, sort_rest=True)


def process_templates_list(items) -> list:
    if not isinstance(items, list):
        return process_node(items)
    out = []
    for item in items:
        if isinstance(item, dict):
            out.append(process_template_item_dict(item))
        else:
            out.append(process_node(item))
    return out


def process_frontmatter(data: dict) -> dict:
    if not isinstance(data, dict):
        return process_node(data)
    out: dict = {}
    for k, v in data.items():
        if k == "templates":
            out[k] = process_templates_list(v)
        else:
            out[k] = process_node(v)
    return reorder_mapping_keys(out, TOP_PRIORITY, sort_rest=True)


def dump_frontmatter(data) -> str:
    yaml = YAML(typ="safe")
    yaml.default_flow_style = False
    yaml.indent(mapping=2, sequence=4, offset=2)
    yaml.allow_unicode = True
    yaml.width = 4096
    # Preserve key order from reorder_mapping_keys (default ruamel sorts mappings).
    yaml.sort_base_mapping_type_on_output = False
    buf = StringIO()
    yaml.dump(data, buf)
    body = buf.getvalue()
    if body and not body.endswith("\n"):
        body += "\n"
    return body


def normalize_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return False
    parts = text.split("---", 2)
    if len(parts) < 3:
        return False
    fm_raw = parts[1]
    rest = parts[2]
    yaml = YAML(typ="safe")
    # Source exports occasionally repeat keys (e.g. image twice); first value wins on load.
    yaml.allow_duplicate_keys = True
    data = yaml.load(fm_raw)
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return False
    new_data = process_frontmatter(data)
    new_fm = dump_frontmatter(new_data)
    new_text = "---\n" + new_fm + "---" + rest
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False


def main() -> None:
    root = Path(__file__).resolve().parents[1] / "content"
    if not root.is_dir():
        print("content/ not found", file=sys.stderr)
        sys.exit(1)
    changed = 0
    for path in sorted(root.rglob("*.md")):
        if normalize_file(path):
            changed += 1
    print(f"updated {changed} files under {root}")


if __name__ == "__main__":
    main()
