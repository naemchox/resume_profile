import re, os, json, sys
R='/Users/jek/GameTranslator'
def read(p): return open(os.path.join(R,p),encoding='utf-8').read()
prob=[]
def bad(w,m): prob.append(f'{w}: {m}')

# 1. duplicate ids per HTML file (check-invariants does NOT test this)
for f in ['renderer/main/index.html','renderer/learn/index.html','website/index.html']:
    s=read(f); ids=re.findall(r'\sid="([^"]+)"',s)
    d=sorted({i for i in ids if ids.count(i)>1})
    if d: bad(f,f'duplicate id(s): {d}')

# 2. i18n parity — every key must exist in BOTH languages
for f in ['renderer/main/i18n.js','renderer/learn/i18n.js']:
    s=read(f)
    blocks=re.findall(r"\n    (\w+): \{(.*?)\n    \},?\n", s, re.S)
    keys={lang:set(re.findall(r"'([\w.]+)'\s*:", body)) for lang,body in blocks}
    if len(keys)>=2:
        langs=list(keys)
        base=langs[0]
        for l in langs[1:]:
            miss=keys[base]-keys[l]; extra=keys[l]-keys[base]
            if miss: bad(f,f'{l} missing {len(miss)}: {sorted(miss)[:6]}')
            if extra: bad(f,f'{l} has {len(extra)} not in {base}: {sorted(extra)[:6]}')

# 3. data-i18n keys used in HTML that no dictionary defines
for html,i18n in [('renderer/main/index.html','renderer/main/i18n.js'),
                  ('renderer/learn/index.html','renderer/learn/i18n.js')]:
    used=set(re.findall(r'data-i18n(?:-html|-tip|-title|-ph)?="([\w.]+)"', read(html)))
    have=set(re.findall(r"'([\w.]+)'\s*:", read(i18n)))
    miss=used-have
    if miss: bad(html,f'data-i18n with no entry: {sorted(miss)}')

# 4. window.i18n.t('x') in JS with no entry
for js,i18n in [('renderer/main/index.js','renderer/main/i18n.js'),
                ('renderer/learn/index.js','renderer/learn/i18n.js')]:
    used=set(re.findall(r"i18n\.t\('([\w.]+)'\)", read(js)))
    have=set(re.findall(r"'([\w.]+)'\s*:", read(i18n)))
    miss=used-have
    if miss: bad(js,f"t() with no entry: {sorted(miss)}")

# 5. CSS class selectors that nothing in HTML or JS ever produces
for css,srcs in [('renderer/main/styles.css',['renderer/main/index.html','renderer/main/index.js']),
                 ('renderer/learn/styles.css',['renderer/learn/index.html','renderer/learn/index.js'])]:
    body=' '.join(read(x) for x in srcs)
    cls=set(re.findall(r'\.([a-z][a-z0-9-]{3,})(?=[\s,{:.\[>])', read(css)))
    dead=sorted(c for c in cls if c not in body)
    if dead: bad(css,f'selectors nothing produces: {dead}')

print('\n'.join(prob) if prob else 'clean')
