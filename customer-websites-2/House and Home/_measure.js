const { chromium } = require('playwright');
const FILE = 'file:///' + 'C:/Users/PC/Desktop/customer-websites-2/House and Home/index.html'.replace(/ /g, '%20');
const DETAIL = process.argv[2] === 'detail';

(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const vp of [{ w: 1440, h: 900, tag: 'desktop' }, { w: 390, h: 844, tag: 'mobile' }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(vp.tag + ' console: ' + m.text()); });
    p.on('pageerror', e => errs.push(vp.tag + ' pageerror: ' + e.message));
    await p.goto(FILE, { waitUntil: 'load' });
    await p.waitForTimeout(1000);
    const H0 = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H0; y += Math.floor(vp.h * 0.8)) { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(80); }
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(300);
    const data = await p.evaluate(({ vh, detail }) => {
      const label = e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 44);
      const secs = [...document.querySelectorAll('main > section, header.site-header, footer.site-footer')].map(s => {
        const r = s.getBoundingClientRect();
        const cs = getComputedStyle(s);
        const kids = [];
        if (detail) {
          const walk = (el, d) => {
            for (const c of el.children) {
              const cr = c.getBoundingClientRect();
              if (cr.height >= 90) { kids.push({ d, n: label(c), h: Math.round(cr.height) }); if (d < 2) walk(c, d + 1); }
            }
          };
          walk(s, 0);
        }
        return { id: s.id || s.className.split(' ')[0], h: Math.round(r.height), sc: +(r.height / vh).toFixed(2), pad: cs.paddingTop + '/' + cs.paddingBottom, kids };
      });
      return { total: document.documentElement.scrollHeight, screens: +(document.documentElement.scrollHeight / vh).toFixed(2), ox: document.documentElement.scrollWidth - document.documentElement.clientWidth, secs };
    }, { vh: vp.h, detail: DETAIL });
    console.log(`===== ${vp.tag} ${vp.w}x${vp.h} : ${data.total}px = ${data.screens} screens | overflowX ${data.ox}`);
    for (const s of data.secs) {
      console.log(`  ${s.id.padEnd(14)} ${String(s.h).padStart(6)}px ${String(s.sc).padStart(5)}sc pad ${s.pad}`);
      for (const k of s.kids) console.log(`      ${'  '.repeat(k.d)}${k.n.padEnd(42 - k.d * 2)} ${String(k.h).padStart(5)}px`);
    }
    await ctx.close();
  }
  console.log('--- errors: ' + (errs.length ? '\n' + errs.join('\n') : 'none'));
  await b.close();
})();
