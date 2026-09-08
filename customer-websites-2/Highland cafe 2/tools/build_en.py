#!/usr/bin/env python3
"""
Generate the English pages under /en/ from the Thai source pages.

Why string surgery instead of an HTML parser: lxml's HTML mode lowercases
attribute names, which turns SVG's `viewBox` into `viewbox` and silently breaks
every inline icon on the site (verified). The pages also contain no nested
`data-en` elements (verified: 0 across all three pages), so locating each
element's matching close tag is unambiguous and a targeted rewrite is lossless.

Run from the project root:  python3 tools/build_en.py
"""

import hashlib
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Single-page site: index.html carries the menu and visit sections as
# in-page anchors. menu.html / visit.html remain on disk as the previous
# multi-page build but are no longer part of the site or the sitemap.
PAGES = ["index"]
ORIGIN = "https://highlandcafe.co.th"

VOID = {"meta", "link", "img", "br", "hr", "input", "source", "use", "path", "circle", "rect"}


def asset_hash(rel_path):
    # CSS and JS are inlined into the page now; these files may not exist.
    if not os.path.exists(os.path.join(ROOT, rel_path)):
        return None
    with open(os.path.join(ROOT, rel_path), "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:8]


def stamp_assets(src):
    """Content-hash the CSS/JS URLs.

    Without this a browser can hold an old main.css indefinitely. That is not
    theoretical: it happened repeatedly during development, and once shipped a
    toggle whose label was unreadable because the cached CSS predated a selector
    change. Idempotent — an existing ?v= is replaced, not appended to.
    """
    for rel, pattern in (
        ("assets/css/main.css", r'(assets/css/main\.css)(\?v=[a-f0-9]+)?'),
        ("assets/js/main.js", r'(assets/js/main\.js)(\?v=[a-f0-9]+)?'),
    ):
        digest = asset_hash(rel)
        if digest is None:
            # Inlined into the page — there is no external URL left to stamp.
            continue
        src = re.sub(pattern, lambda m, d=digest: m.group(1) + "?v=" + d, src)
    return src


def attr_pattern(name):
    return re.compile(r'\s' + re.escape(name) + r'="((?:[^"])*)"')


def unescape_attr(value):
    """An attribute value carrying HTML markup — turn it back into markup."""
    return html.unescape(value)


def find_matching_close(src, tag, from_idx):
    """Index of the close tag matching an already-open `tag` starting at from_idx."""
    open_re = re.compile(r'<' + tag + r'(\s|>|/)', re.I)
    close_re = re.compile(r'</' + tag + r'\s*>', re.I)
    depth = 1
    i = from_idx
    while i < len(src):
        nxt_open = open_re.search(src, i)
        nxt_close = close_re.search(src, i)
        if not nxt_close:
            raise ValueError("unbalanced <%s> from %d" % (tag, from_idx))
        if nxt_open and nxt_open.start() < nxt_close.start():
            depth += 1
            i = nxt_open.end()
            continue
        depth -= 1
        if depth == 0:
            return nxt_close.start(), nxt_close.end()
        i = nxt_close.end()
    raise ValueError("unbalanced <%s>" % tag)


def apply_data_en(src):
    """Replace innerHTML with data-en, and swap aria-label / content / alt variants."""
    swapped = {"content": 0, "label": 0, "alt": 0, "title": 0, "inner": 0}

    # 1. data-en-content -> content="..."   (void elements: <meta>)
    def repl_content(m):
        swapped["content"] += 1
        en = m.group("en")
        tag = m.group(0)
        tag = attr_pattern("content").sub(' content="' + en.replace("\\", "\\\\") + '"', tag, count=1)
        tag = re.sub(r'\sdata-en-content="(?:[^"])*"', "", tag)
        return tag

    src = re.sub(r'<meta\b[^>]*\sdata-en-content="(?P<en>(?:[^"])*)"[^>]*>', repl_content, src)

    # 2. data-en-label -> aria-label="..."
    def repl_label(m):
        swapped["label"] += 1
        en = m.group("en")
        tag = m.group(0)
        tag = attr_pattern("aria-label").sub(' aria-label="' + en.replace("\\", "\\\\") + '"', tag, count=1)
        tag = re.sub(r'\sdata-en-label="(?:[^"])*"', "", tag)
        return tag

    src = re.sub(r'<[a-zA-Z][^>]*\sdata-en-label="(?P<en>(?:[^"])*)"[^>]*>', repl_label, src)

    # 3. data-en-alt -> alt="..."   (photographs carry Thai alt text on the
    #    Thai pages; a screen reader on /en/ must not be read Thai)
    def repl_alt(m):
        swapped["alt"] += 1
        en = m.group("en")
        tag = m.group(0)
        tag = attr_pattern("alt").sub(' alt="' + en.replace("\\", "\\\\") + '"', tag, count=1)
        tag = re.sub(r'\sdata-en-alt="(?:[^"])*"', "", tag)
        return tag

    src = re.sub(r'<img\b[^>]*\sdata-en-alt="(?P<en>(?:[^"])*)"[^>]*>', repl_alt, src)

    # 3b. data-en-title -> title="..."   (an <iframe>'s accessible name is its
    #     title; the embedded Google map must not announce itself in Thai on /en/)
    def repl_title(m):
        swapped["title"] += 1
        en = m.group("en")
        tag = m.group(0)
        tag = attr_pattern("title").sub(' title="' + en.replace("\\", "\\\\") + '"', tag, count=1)
        tag = re.sub(r'\sdata-en-title="(?:[^"])*"', "", tag)
        return tag

    src = re.sub(r'<[a-zA-Z][^>]*\sdata-en-title="(?P<en>(?:[^"])*)"[^>]*>', repl_title, src)

    # 4. data-en -> innerHTML. Walk right-to-left so earlier offsets stay valid.
    open_tag_re = re.compile(r'<(?P<tag>[a-zA-Z][a-zA-Z0-9]*)\b(?P<attrs>[^>]*?)\sdata-en="(?P<en>(?:[^"])*)"(?P<rest>[^>]*)>')
    matches = list(open_tag_re.finditer(src))
    for m in reversed(matches):
        tag = m.group("tag").lower()
        en_html = unescape_attr(m.group("en"))
        # Rebuild the opening tag without the data-en attribute.
        new_open = "<" + m.group("tag") + m.group("attrs") + m.group("rest") + ">"
        if tag in VOID:
            src = src[:m.start()] + new_open + src[m.end():]
            continue
        close_start, close_end = find_matching_close(src, m.group("tag"), m.end())
        src = src[:m.start()] + new_open + en_html + src[close_start:]
        swapped["inner"] += 1

    return src, swapped


def strip_leftovers(src):
    src = re.sub(r'\sdata-en="(?:[^"])*"', "", src)
    src = re.sub(r'\sdata-en-label="(?:[^"])*"', "", src)
    src = re.sub(r'\sdata-en-content="(?:[^"])*"', "", src)
    src = re.sub(r'\sdata-en-alt="(?:[^"])*"', "", src)
    src = re.sub(r'\sdata-en-title="(?:[^"])*"', "", src)
    return src


def localise(src, page):
    """Rewrite paths, hreflang, locale and the language toggle for /en/."""
    th_url = ORIGIN + ("/" if page == "index" else "/%s.html" % page)
    en_url = "%s/en/%s.html" % (ORIGIN, page)

    src = src.replace('<html lang="th">', '<html lang="en">', 1)

    # Assets live one level up from /en/
    src = src.replace('href="assets/', 'href="../assets/')
    src = src.replace('src="assets/', 'src="../assets/')
    # @font-face lives in the inlined <style>; url() is neither href nor src.
    src = src.replace('url(assets/', 'url(../assets/')
    # srcset holds several comma-separated paths in one attribute, so a single
    # prefix replace is not enough — rewrite every path inside the value.
    src = re.sub(
        r'srcset="([^"]*)"',
        lambda m: 'srcset="' + m.group(1).replace('assets/', '../assets/') + '"',
        src,
    )

    # Canonical + og:url point at the English page
    src = re.sub(r'<link rel="canonical" href="[^"]*">',
                 '<link rel="canonical" href="%s">' % en_url, src, count=1)
    src = re.sub(r'<meta property="og:url" content="[^"]*">',
                 '<meta property="og:url" content="%s">' % en_url, src, count=1)

    # hreflang alternates (head links only — the toggle anchors are handled below)
    src = re.sub(r'<link rel="alternate" hreflang="th" href="[^"]*">',
                 '<link rel="alternate" hreflang="th" href="%s">' % th_url, src, count=1)
    src = re.sub(r'<link rel="alternate" hreflang="en" href="[^"]*">',
                 '<link rel="alternate" hreflang="en" href="%s">' % en_url, src, count=1)
    src = re.sub(r'<link rel="alternate" hreflang="x-default" href="[^"]*">',
                 '<link rel="alternate" hreflang="x-default" href="%s">' % th_url, src, count=1)

    src = src.replace('<meta property="og:locale" content="th_TH">',
                      '<meta property="og:locale" content="en_US">', 1)
    src = src.replace('<meta property="og:locale:alternate" content="en_US">',
                      '<meta property="og:locale:alternate" content="th_TH">', 1)

    # og:title / og:description should be the English ones
    title = re.search(r'<title[^>]*>(.*?)</title>', src, re.S)
    if title:
        src = re.sub(r'<meta property="og:title" content="[^"]*">',
                     '<meta property="og:title" content="%s">' % html.escape(title.group(1).strip(), quote=True),
                     src, count=1)
    desc = re.search(r'<meta name="description" content="([^"]*)"', src)
    if desc:
        src = re.sub(r'<meta property="og:description" content="[^"]*">',
                     '<meta property="og:description" content="%s">' % desc.group(1),
                     src, count=1)

    # Language toggle: flip active state and repoint both links
    src = src.replace('<div class="lang-toggle" data-active="th">',
                      '<div class="lang-toggle" data-active="en">', 1)
    src = src.replace('<a class="lang-toggle__opt" href="%s.html" hreflang="th" aria-current="true">' % page,
                      '<a class="lang-toggle__opt" href="../%s.html" hreflang="th">' % page, 1)
    src = src.replace('<a class="lang-toggle__opt" href="en/%s.html" hreflang="en">' % page,
                      '<a class="lang-toggle__opt" href="%s.html" hreflang="en" aria-current="true">' % page, 1)

    return src


def build_sitemap():
    urls = []
    for page in PAGES:
        th = ORIGIN + ("/" if page == "index" else "/%s.html" % page)
        en = "%s/en/%s.html" % (ORIGIN, page)
        for loc, alt_self, alt_other, other_lang in (
            (th, th, en, "en"), (en, en, th, "th")
        ):
            urls.append(
                "  <url>\n"
                "    <loc>%s</loc>\n"
                '    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>\n'
                '    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>\n'
                '    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>\n'
                "  </url>" % (loc, "th" if loc == th else "en", alt_self,
                              other_lang, alt_other, th)
            )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + "\n".join(urls) + "\n</urlset>\n"
    )


def main():
    os.makedirs(os.path.join(ROOT, "en"), exist_ok=True)
    total = {"content": 0, "label": 0, "alt": 0, "title": 0, "inner": 0}

    for page in PAGES:
        src_path = os.path.join(ROOT, "%s.html" % page)
        with open(src_path, encoding="utf-8") as fh:
            src = fh.read()

        # Stamp the Thai page in place so the deployed Thai pages are versioned
        # too, then generate English from the already-stamped markup.
        stamped = stamp_assets(src)
        if stamped != src:
            with open(src_path, "w", encoding="utf-8") as fh:
                fh.write(stamped)
            src = stamped

        out, swapped = apply_data_en(src)
        out = strip_leftovers(out)
        out = localise(out, page)

        for k in total:
            total[k] += swapped[k]

        # Count real untranslated ATTRIBUTES, not every mention of the string.
        # A CSS comment in index.html documents the "[data-en]" convention, and
        # a bare substring search counts it forever — which would hide the next
        # genuine leftover behind a permanent count of 1.
        leftover = len(re.findall(r'\sdata-en[a-z-]*=', out))
        thai = len(re.findall(r'[฀-๿]', out))

        dest = os.path.join(ROOT, "en", "%s.html" % page)
        with open(dest, "w", encoding="utf-8") as fh:
            fh.write(out)

        print("en/%-11s inner=%-3d label=%-2d content=%-2d alt=%-2d title=%-2d  leftover data-en=%d  thai chars=%d"
              % (page + ".html", swapped["inner"], swapped["label"], swapped["content"],
                 swapped["alt"], swapped["title"], leftover, thai))

    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write(build_sitemap())
    print("sitemap.xml written (%d urls)" % (len(PAGES) * 2))
    print("totals:", total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
