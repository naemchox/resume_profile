#!/usr/bin/env python3
"""
Regenerate `Highland cafe_finished/` — the Netlify publish root.

Two jobs, and the second is the reason this script exists:

1. Copy the runtime allowlist. Only files the site actually serves get
   copied, so FACTS.md, SPEC.md, tools/ and the ~60 MB of working
   photography in source-photos/ cannot be deployed by accident. An
   allowlist cannot be defeated by forgetting to add a blocklist rule.

2. Recompute the CSP hashes in netlify.toml from the files it just
   copied. index.html carries the entire stylesheet and all behaviour
   inline, so ANY edit — down to a single space — changes its sha256.
   A stale hash does not degrade the site, it deletes it: no styles, no
   JavaScript, on every page at once. Doing this by hand is a question
   of when, not whether, someone forgets.

Run from the project root, after tools/build_en.py:

    python3 tools/build_en.py && python3 tools/build_deploy.py
"""

import base64
import hashlib
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Highland cafe_finished")

PAGES = ["index.html", os.path.join("en", "index.html")]
ROOT_FILES = ["robots.txt", "sitemap.xml"]
ASSET_DIRS = [("assets/fonts", ".woff2"), ("assets/images", ".webp")]
ASSET_FILES = ["assets/og-image.jpg"]

# Anything matching these must never reach the publish root. Checked after
# the copy as a belt-and-braces assertion, not relied on as the mechanism.
FORBIDDEN = (".md", ".py", ".toml.bak", "fonts.css")


def sha(text):
    return "sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()


def inline_hashes(path):
    """sha256 of every inline <script> and <style> in a page.

    JSON-LD is not executable, but Chrome applies script-src to it, so those
    blocks need hashes too. <script src=...> is skipped — it is covered by
    'self', and this site has none anyway.
    """
    src = open(path, encoding="utf-8").read()
    scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", src, re.S)
    styles = re.findall(r"<style[^>]*>(.*?)</style>", src, re.S)
    return [sha(s) for s in scripts], [sha(s) for s in styles]


def copy_tree():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    copied = 0
    for rel in PAGES + ROOT_FILES + ASSET_FILES:
        dst = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dst)
        copied += 1
    for rel_dir, ext in ASSET_DIRS:
        src_dir = os.path.join(ROOT, rel_dir)
        dst_dir = os.path.join(OUT, rel_dir)
        os.makedirs(dst_dir, exist_ok=True)
        for name in sorted(os.listdir(src_dir)):
            if name.endswith(ext):
                shutil.copy2(os.path.join(src_dir, name), os.path.join(dst_dir, name))
                copied += 1
    return copied


def write_config(script_hashes, style_hashes):
    """Rewrite the two hash lists inside the CSP, leaving the rest alone."""
    cfg_src = os.path.join(ROOT, "netlify.toml")
    cfg_dst = os.path.join(OUT, "netlify.toml")
    toml = open(cfg_src, encoding="utf-8").read()

    def block(hashes):
        # The final entry closes the directive with ";" — the pattern below
        # must match that form too, or the old last hash survives forever.
        out = []
        for i, h in enumerate(hashes):
            tail = "'; \\\n" if i == len(hashes) - 1 else "' \\\n"
            out.append("        '%s%s" % (h, tail))
        return "".join(out)

    toml, n1 = re.subn(
        r"(script-src 'self' \\\n)(?:\s*'sha256-[^']+';? \\\n)+",
        lambda m: m.group(1) + block(script_hashes),
        toml,
    )
    toml, n2 = re.subn(
        r"(style-src 'self' \\\n)(?:\s*'sha256-[^']+';? \\\n)+",
        lambda m: m.group(1) + block(style_hashes),
        toml,
    )
    if n1 != 1 or n2 != 1:
        sys.exit("FAILED: could not locate the CSP hash lists in netlify.toml "
                 "(script-src matches=%d, style-src matches=%d). The template "
                 "format changed — fix this script before deploying." % (n1, n2))
    open(cfg_dst, "w", encoding="utf-8").write(toml)


def verify():
    """Assert the publish root is exactly what we intended."""
    problems = []
    for dirpath, _, names in os.walk(OUT):
        for n in names:
            if any(n.endswith(bad) or n == bad for bad in FORBIDDEN):
                problems.append(os.path.relpath(os.path.join(dirpath, n), OUT))

    # Every relative reference in the deployed pages must resolve inside OUT.
    missing = []
    for rel in PAGES:
        page = os.path.join(OUT, rel)
        base = os.path.dirname(page)
        src = open(page, encoding="utf-8").read()
        refs = set(re.findall(r'(?:src|href)="((?!https?:|#|tel:|mailto:|data:)[^"]+)"', src))
        for m in re.findall(r'srcset="([^"]*)"', src):
            refs |= {p.strip().split()[0] for p in m.split(",") if p.strip()}
        refs |= {u.strip("'\"") for u in re.findall(r"url\(([^)]+)\)", src)}
        for r in refs:
            r = r.split("?")[0]
            if r.startswith("data:") or "#" in r:
                continue
            if not os.path.exists(os.path.normpath(os.path.join(base, r))):
                missing.append("%s -> %s" % (rel, r))

    # The hashes in the config must be EXACTLY the hashes of the copied
    # files — not merely a superset. An extra hash is a stale one that
    # survived a regeneration, and it silently widens the policy.
    stale = []
    toml = open(os.path.join(OUT, "netlify.toml"), encoding="utf-8").read()
    in_config = set(re.findall(r"'(sha256-[^']+)'", toml))
    needed = set()
    for rel in PAGES:
        sc, st = inline_hashes(os.path.join(OUT, rel))
        needed.update(sc + st)
    for h in sorted(needed - in_config):
        stale.append("missing from netlify.toml: %s" % h)
    for h in sorted(in_config - needed):
        stale.append("stale, matches no inline block: %s" % h)

    return problems, missing, stale


def main():
    copied = copy_tree()

    script_hashes, style_hashes = [], []
    for rel in PAGES:
        sc, st = inline_hashes(os.path.join(OUT, rel))
        for h in sc:
            if h not in script_hashes:
                script_hashes.append(h)
        for h in st:
            if h not in style_hashes:
                style_hashes.append(h)

    write_config(script_hashes, style_hashes)
    copied += 1

    problems, missing, stale = verify()
    total = sum(len(f) for _, _, f in os.walk(OUT))

    print("Highland cafe_finished/ regenerated")
    print("  files            : %d" % total)
    print("  script-src hashes: %d" % len(script_hashes))
    print("  style-src hashes : %d" % len(style_hashes))

    if problems or missing or stale:
        print()
        for p in problems:
            print("  LEAKED  internal file in publish root: %s" % p)
        for m in missing:
            print("  BROKEN  unresolved reference: %s" % m)
        for s in stale:
            print("  STALE   hash missing from netlify.toml: %s" % s)
        sys.exit(1)

    print("  verified         : no internal files, no broken refs, hashes current")


if __name__ == "__main__":
    main()
