"""House and Home — palette v3 (final).

Two corrections against the shipped v1:

  1. HUE. index.html runs `--h: 48` = terracotta/rust. DESIGN.md claims 85.
     The customer's own gold, sampled from hh-src-01.jpg, is oklch(.858 .120 95.6).
     48 is orange-brown; the brand is yellow-gold. v3 runs 95 for gold and 85 for
     the warm neutrals.

  2. VALUE RANGE. v1's six surfaces all sit in L .86-.98 and the darkest ink is
     L .30 — nothing on the page is dark. The customer's artwork is 21% deep navy
     (#182028 = oklch(.239 .019 249)). v3 adds that navy as a real surface family,
     which is what gives the page a dark mass to push against.

Same gold hue, two lightnesses: deep bronze-gold on paper, bright gold on navy.
That is how their poster already works.
"""
import math

def oklch_to_linear(L, C, h_deg):
    h = math.radians(h_deg)
    a, b = C*math.cos(h), C*math.sin(h)
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    return ( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
            -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
            -0.0041960863*l - 0.7034186147*m + 1.7076147010*s)

def gamma(u):
    u = max(0.0, min(1.0, u))
    return 12.92*u if u <= 0.0031308 else 1.055*(u**(1/2.4)) - 0.055

def ungamma(u):
    return u/12.92 if u <= 0.04045 else ((u+0.055)/1.055)**2.4

def in_gamut(L, C, h):
    return all(-0.0005 <= v <= 1.0005 for v in oklch_to_linear(L, C, h))

def to_hex(L, C, h):
    return '#%02X%02X%02X' % tuple(round(gamma(v)*255) for v in oklch_to_linear(L, C, h))

def lum(L, C, h):
    r, g, b = oklch_to_linear(L, C, h)
    return sum(w*ungamma(gamma(u)) for w, u in zip((0.2126, 0.7152, 0.0722), (r, g, b)))

def contrast(c1, c2):
    a, b = lum(*c1), lum(*c2)
    hi, lo = max(a, b), min(a, b)
    return (hi+0.05)/(lo+0.05)

def max_chroma(L, h):
    lo, hi = 0.0, 0.45
    for _ in range(60):
        mid = (lo+hi)/2
        lo, hi = (mid, hi) if in_gamut(L, mid, h) else (lo, mid)
    return lo

HN = 85.0    # warm neutral — paper, ink, muted (marble/sand)
HG = 95.0    # BRAND GOLD, sampled from the customer's monogram + rules
HB = 76.0    # the same gold DARKENED. Hold hue 95 and drop L and you get
             # olive (#6F5C01), not bronze — real gold darkens toward brown.
             # Their own gradients confirm it: shadow side samples #504020
             # = oklch(.381 .052 83). So the dark end rotates to 76.
HC = 250.0   # BRAND NAVY, sampled from the customer's card panels

print('=== gamut caps ===')
for h, nm in ((HN, 'neutral 85'), (HG, 'gold 95'), (HC, 'navy 250')):
    print(f'  hue {nm:11s} ' + '  '.join(f'L{L:.2f}->{max_chroma(L,h):.3f}'
          for L in (0.14, 0.19, 0.26, 0.40, 0.50, 0.62, 0.78, 0.86)))

PAPER = {
    'page':      (0.980, 0.004, HN),
    'surface':   (0.955, 0.008, HN),
    'sunken':    (0.915, 0.013, HN),
    'border':    (0.870, 0.018, HN),
    'line':      (0.620, 0.030, HN),
    'muted':     (0.500, 0.028, HN),
    'ink':       (0.260, 0.030, HN),
    'action':    (0.480, 0.098, HB),   # deep bronze-gold — the gold, on paper
    'action-hi': (0.400, 0.082, HB),
    'on-action': (0.985, 0.005, HN),
}
DEEP = {
    'deep':       (0.190, 0.028, HC),
    'deep-lo':    (0.140, 0.024, HC),
    'deep-hi':    (0.255, 0.032, HC),
    'deep-line':  (0.500, 0.045, HC),
    'gold':       (0.855, 0.120, HG),   # the brand gold, verbatim
    'gold-dim':   (0.700, 0.110, HG),
    'deep-ink':   (0.960, 0.008, HN),
    'deep-muted': (0.760, 0.020, HN),
    'glow':       (0.930, 0.050, HN),
}

for name, S in (('PAPER', PAPER), ('DEEP', DEEP)):
    print(f'\n=== {name} ===')
    for k, v in S.items():
        flag = '' if in_gamut(*v) else f'   ** OUT OF GAMUT (cap {max_chroma(v[0],v[2]):.3f}) **'
        print(f'  --c-{k:<11} {to_hex(*v)}   oklch({v[0]} {v[1]} {v[2]:g}){flag}')

print('\n=== CONTRAST ===')
CHECKS = [
    ('PAPER ink / page          body',           PAPER['ink'],       PAPER['page'],    8.4),
    ('PAPER muted / page        captions',       PAPER['muted'],     PAPER['page'],    4.5),
    ('PAPER muted / surface',                    PAPER['muted'],     PAPER['surface'], 4.5),
    ('PAPER on-action / action  button label',   PAPER['on-action'], PAPER['action'],  4.5),
    ('PAPER action / page       links, eyebrow', PAPER['action'],    PAPER['page'],    4.5),
    ('PAPER action / surface',                   PAPER['action'],    PAPER['surface'], 4.5),
    ('PAPER line / page         control border', PAPER['line'],      PAPER['page'],    3.0),
    ('DEEP  deep-ink / deep     body on navy',   DEEP['deep-ink'],   DEEP['deep'],     8.4),
    ('DEEP  deep-muted / deep   captions',       DEEP['deep-muted'], DEEP['deep'],     4.5),
    ('DEEP  gold / deep         gold headline',  DEEP['gold'],       DEEP['deep'],     4.5),
    ('DEEP  gold-dim / deep     small gold',     DEEP['gold-dim'],   DEEP['deep'],     4.5),
    ('DEEP  deep / gold         label on gold',  DEEP['deep'],       DEEP['gold'],     4.5),
    ('DEEP  deep-ink / deep-hi  body on card',   DEEP['deep-ink'],   DEEP['deep-hi'],  8.4),
    ('DEEP  deep-muted / deep-hi',               DEEP['deep-muted'], DEEP['deep-hi'],  4.5),
    ('DEEP  gold / deep-hi',                     DEEP['gold'],       DEEP['deep-hi'],  4.5),
    ('DEEP  deep-line / deep    card hairline',  DEEP['deep-line'],  DEEP['deep'],     3.0),
    ('DEEP  deep-ink / deep-lo  body on floor',  DEEP['deep-ink'],   DEEP['deep-lo'],  8.4),
]
bad = 0
for label, a, b, target in CHECKS:
    r = contrast(a, b)
    ok = r >= target
    bad += not ok
    print(f'  {label:<44}{r:>6.2f}:1  (>={target})  {"OK" if ok else "FAIL"}')
print(f'\n  {len(CHECKS)-bad}/{len(CHECKS)} pass')

print('\n=== VALUE RANGE ===')
for k, v in [('deep-lo', DEEP['deep-lo']), ('deep', DEEP['deep']), ('deep-hi', DEEP['deep-hi']),
             ('sunken', PAPER['sunken']), ('surface', PAPER['surface']), ('page', PAPER['page'])]:
    print(f'  {k:<9} L {v[0]:.3f}  {to_hex(*v)}')
print(f'  v1 surface spread  L .910 -> .980  = 0.070   (why it reads flat)')
print(f'  v3 surface spread  L .140 -> .980  = 0.840')
print(f'  v1 peak chroma     C .127 @ hue 48 (rust)')
print(f'  v3 peak chroma     C .120 @ hue 95 (brand gold) on a navy ground')


# ── DARK MODE — the page becomes the navy, accent becomes the bright gold ──
# Page sits at L .130, BELOW the deep bands at L .190, so a .deep section still
# reads as a raised panel and the paper/deep rhythm survives the toggle.
DARKM = {
    'page':      (0.130, 0.022, HC),
    'surface':   (0.205, 0.030, HC),
    'sunken':    (0.100, 0.018, HC),
    'border':    (0.310, 0.035, HC),
    'line':      (0.520, 0.045, HC),
    'muted':     (0.760, 0.020, HN),
    'action':    (0.855, 0.120, HG),
    'action-hi': (0.930, 0.070, HG),
    'ink':       (0.960, 0.008, HN),
    'on-action': (0.190, 0.028, HC),
}
print('\n=== DARK MODE ===')
for k, v in DARKM.items():
    flag = '' if in_gamut(*v) else f'   ** OUT OF GAMUT (cap {max_chroma(v[0], v[2]):.3f}) **'
    print(f'  --c-{k:<11} {to_hex(*v)}   oklch({v[0]} {v[1]} {v[2]:g}){flag}')
DCHECKS = [
    ('DARK  ink / page          body',          DARKM['ink'],       DARKM['page'],    8.4),
    ('DARK  muted / page        captions',      DARKM['muted'],     DARKM['page'],    4.5),
    ('DARK  muted / surface',                   DARKM['muted'],     DARKM['surface'], 4.5),
    ('DARK  on-action / action  button label',  DARKM['on-action'], DARKM['action'],  4.5),
    ('DARK  action / page       links',         DARKM['action'],    DARKM['page'],    4.5),
    ('DARK  action / surface',                  DARKM['action'],    DARKM['surface'], 4.5),
    ('DARK  line / page         control border',DARKM['line'],      DARKM['page'],    3.0),
    ('DARK  ink / surface',                     DARKM['ink'],       DARKM['surface'], 8.4),
]
dbad = 0
for label, a, b, target in DCHECKS:
    r = contrast(a, b); ok = r >= target; dbad += not ok
    print(f'  {label:<44}{r:>6.2f}:1  (>={target})  {"OK" if ok else "FAIL"}')
print(f'\n  {len(DCHECKS)-dbad}/{len(DCHECKS)} pass')
print(f'  dark page L .130 < deep band L .190 -> deep bands stay raised in dark mode')
