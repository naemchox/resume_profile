"""Composite real screenshots into the green-screen device mockup.

The mockup is a flat render with chroma-green in two places: the page behind the
devices, and every screen. Both get keyed out; the screens are then filled with
the project's own captures — desktop shot in the monitor and the laptop, tablet
shot in the tablet, phone shot in the phone — and the device layer is laid back
on top so bezels, stand and keyboard sit over the screenshot edges.

Run: python3 _mockup.py <project-key> <out.webp>
"""
import sys
from PIL import Image, ImageFilter

MOCKUP = "/Users/jek/Downloads/Gemini_Generated_Image_luhf6qluhf6qluhf.jpg"
SCALE = 2          # work at 2x so the screens stay sharp after the final resize
OUT_W = 1500

def is_green(p):
    r, g, b = p[:3]
    return g > 90 and g > r * 1.7 and g > b * 1.7

def component(px, W, H, seed):
    """Scanline flood fill over the green mask; returns the set of pixels."""
    sx, sy = seed
    seen = set()
    stack = [(sx, sy)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H) or not is_green(px[x, y]):
            continue
        a = x
        while a > 0 and is_green(px[a - 1, y]) and (a - 1, y) not in seen:
            a -= 1
        b = x
        while b < W - 1 and is_green(px[b + 1, y]) and (b + 1, y) not in seen:
            b += 1
        for i in range(a, b + 1):
            seen.add((i, y))
            if y > 0 and is_green(px[i, y - 1]) and (i, y - 1) not in seen:
                stack.append((i, y - 1))
            if y < H - 1 and is_green(px[i, y + 1]) and (i, y + 1) not in seen:
                stack.append((i, y + 1))
    return seen

def corners(pts):
    """TL, TR, BR, BL of a (possibly rotated) quad."""
    tl = min(pts, key=lambda p: p[0] + p[1])
    br = max(pts, key=lambda p: p[0] + p[1])
    tr = max(pts, key=lambda p: p[0] - p[1])
    bl = min(pts, key=lambda p: p[0] - p[1])
    return [tl, tr, br, bl]

def grow(quad, f=1.02):
    cx = sum(p[0] for p in quad) / 4.0
    cy = sum(p[1] for p in quad) / 4.0
    return [(cx + (x - cx) * f, cy + (y - cy) * f) for x, y in quad]

def solve(A, b):
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        pivot = M[c][c]
        for r in range(n):
            if r == c:
                continue
            f = M[r][c] / pivot
            for k in range(c, n + 1):
                M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]

def coeffs(dst, src):
    """PIL wants the map from OUTPUT space back to INPUT space."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return solve(A, b)

def fill(canvas, shot_path, quad, mask):
    shot = Image.open(shot_path).convert("RGB")
    w, h = shot.size
    # Cover, not stretch: crop the capture to the screen's aspect from the top,
    # the same rule the page uses for every other screenshot on it.
    qw = max(abs(quad[1][0] - quad[0][0]), abs(quad[2][0] - quad[3][0]))
    qh = max(abs(quad[3][1] - quad[0][1]), abs(quad[2][1] - quad[1][1]))
    target = qw / qh
    if w / h > target:
        nw = int(h * target); shot = shot.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target); shot = shot.crop((0, 0, w, nh))
    src = [(0, 0), (shot.width, 0), (shot.width, shot.height), (0, shot.height)]
    warped = shot.transform(canvas.size, Image.PERSPECTIVE, coeffs(quad, src), Image.BICUBIC)
    canvas.paste(warped, (0, 0), mask)

# Sources per tab. The mobile tab is the one exception: Quit Day is a phone-first
# game, so its desktop render is a near-empty page — the big screens carry Ijek
# (the other app on that tab) and the phone carries Quit Day. The caption names
# both, so nothing is implied that is not true.
SOURCES = {
    "velvet":  dict(monitor="velvet-desk",  laptop="velvet-desk2", tablet="velvet-tab", phone="velvet-phone"),
    "ijek":    dict(monitor="ijek-desk",    laptop="ijek-desk2",   tablet="ijek-tab",   phone="ijek-phone"),
    "quitday": dict(monitor="ijek-desk",    laptop="ijek-desk2",   tablet="ijek-tab",   phone="quitday-phone"),
    "lumen":   dict(monitor="lumen-desk",   laptop="lumen-desk2",  tablet="lumen-tab",  phone="lumen-phone"),
    "home":    dict(monitor="home-desk",    laptop="home-desk2",   tablet="home-tab",   phone="home-phone"),
}

def build(key, out):
    base = Image.open(MOCKUP).convert("RGB")
    # The generated mockup has a line of Thai baked into the bottom of the frame.
    # The page writes that line itself, in the page's own type; crop it off.
    base = base.crop((0, 0, base.width, 722))
    W, H = base.size
    px = base.load()
    seeds = {"monitor": (660, 250), "laptop": (1050, 500), "tablet": (200, 520), "phone": (300, 570)}
    shots = {k: f"/tmp/dv-{v}.png" for k, v in SOURCES[key].items()}
    big = (W * SCALE, H * SCALE)
    canvas = Image.new("RGBA", big, (0, 0, 0, 0))
    for name, seed in seeds.items():
        pts = component(px, W, H, seed)
        m = Image.new("L", (W, H), 0)
        mp = m.load()
        for x, y in pts:
            mp[x, y] = 255
        m = m.resize(big, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
        quad = [(x * SCALE, y * SCALE) for x, y in grow(corners(pts))]
        fill(canvas, shots[name], quad, m)
    # Device layer: everything that is NOT green, with the green spill pulled out
    # of the edge pixels so the bezels do not glow.
    dev = base.convert("RGBA").resize(big, Image.LANCZOS)
    dpx = dev.load()
    for y in range(big[1]):
        for x in range(big[0]):
            r, g, b, _ = dpx[x, y]
            if g > 90 and g > r * 1.5 and g > b * 1.5:
                dpx[x, y] = (r, g, b, 0)
            elif g > (r + b) // 2 + 12:
                lim = (r + b) // 2 + 12
                dpx[x, y] = (r, lim, b, 255)
    canvas.alpha_composite(dev)
    canvas = canvas.crop(canvas.getbbox())
    canvas = canvas.resize((OUT_W, round(OUT_W * canvas.height / canvas.width)), Image.LANCZOS)
    canvas.save(out, "WEBP", quality=72, method=6)
    print(out, canvas.size)

if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
