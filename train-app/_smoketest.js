const puppeteer = require('./node_modules/puppeteer-core');
const URL = process.argv[2] || 'http://localhost:8000/';
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('pageerror: ' + ((e && e.message) || e)));
  try { await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  catch (e) { console.log('GOTO FAILED:', e.message); await browser.close(); process.exit(1); }
  await new Promise(r => setTimeout(r, 12000));
  const info = await page.evaluate(() => { const r = document.getElementById('root'); return { rootLen: r ? r.innerHTML.length : -1, body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120) }; });
  console.log('rootLen:', info.rootLen, '| body:', JSON.stringify(info.body));
  const real = errors.filter(e => !e.includes('[BABEL] Note'));
  console.log('realErrorCount:', real.length);
  if (real.length) console.log(real.slice(0, 10).join('\n'));
  await browser.close();
})().catch(e => { console.error('SMOKETEST CRASH:', e); process.exit(1); });
