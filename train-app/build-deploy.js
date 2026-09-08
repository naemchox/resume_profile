// build-deploy.js — assemble a clean static `dist/` for hosting (Cloudflare Pages,
// Netlify, Vercel, GitHub Pages — all the same: pure static files + HTTPS).
//
//   node build-deploy.js            → build dist/
//   node build-deploy.js --deploy   → build, then deploy to Cloudflare Pages (needs wrangler)
//
// Why a build step at all? A static host serves "/" from index.html. For a product you
// SELL, "/" should be the marketing landing (visitors see the pitch), and the app lives at
// /train.html. So: index.html = landing.html, train.html = the app, and the installed PWA
// opens the app (manifest start_url = ./train.html). Icons + legal pages + sw.js + manifest
// all ship too — if any are missing the SW's cache.addAll() rejects and the PWA won't
// install. The old `deploy/` folder is STALE — ignore it; this writes a fresh `dist/`.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const PROJECT = 'train-with-myself'; // Cloudflare Pages project name

// Files that make up the deployable app. (No _serve.js — that's the local dev server.
// No train.backup — that's a snapshot. No build-deploy.js / *.sql / *.md / *.exe.)
// The SW's SHELL precaches the icons, so ALL of them must ship or install() fails.
const ASSETS = [
  'sw.js', 'manifest.webmanifest', 'train-icon.svg',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'train.css', 'train-i18n.js', 'train-emoji-kw.js', // train.html's extracted styles + i18n + emoji search index — must ship beside it
];
// Extra HTML pages copied as-is: marketing landing + legal. landing.html also becomes
// index.html (the site root); privacy/terms are linked from the landing + legal pages.
const PAGES = ['landing.html', 'privacy.html', 'terms.html', 'linkbio.html', 'linkbio-en.html'];
const MAIN = 'train.html';

function die(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1); }
function read(f) { return fs.readFileSync(path.join(ROOT, f)); }

// Precompile the in-browser Babel block so the SHIPPED app loads instantly.
// Dev (source train.html) keeps `<script type="text/babel">` + Babel Standalone for the
// documented zero-build workflow. But compiling ~770KB of JSX in the browser costs ~4s on
// EVERY load (the app's real "lag"). For dist we transform that block ahead of time (JSX → JS)
// and drop the Babel Standalone runtime — load falls to well under a second. #root (line ~59)
// and the React/ReactDOM/Supabase/i18n scripts all precede this block, so the compiled plain
// script can run immediately (same deps + mount target available; no defer wrapper needed).
function precompileBabel(htmlStr) {
  const OPEN = '<script type="text/babel">';
  const i = htmlStr.indexOf(OPEN);
  if (i === -1) { console.log('  ⚠ no <script type="text/babel"> block — shipping train.html as-is\n'); return htmlStr; }
  const start = i + OPEN.length;
  const end = htmlStr.indexOf('</script>', start);
  if (end === -1) die('unterminated <script type="text/babel"> block in ' + MAIN);
  const src = htmlStr.slice(start, end);
  let code;
  try {
    code = require('@babel/core').transform(src, {
      presets: [[require('@babel/preset-react'), { runtime: 'classic' }]], // JSX only — modern JS ships as-is
      babelrc: false, configFile: false, compact: false, sourceMaps: false, filename: 'train.jsx',
    }).code;
  } catch (e) { die('Babel precompile failed: ' + e.message); }
  // Swap the babel block for a plain inline script, then remove the Babel Standalone CDN tag.
  let out = htmlStr.slice(0, i) + '<script>\n' + code + '\n</script>' + htmlStr.slice(end + '</script>'.length);
  out = out.replace(/[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"><\/script>\r?\n?/, '');
  console.log('  precompiled JSX → JS (Babel Standalone removed) · ' + (src.length / 1024 | 0) + 'KB JSX → ' + (code.length / 1024 | 0) + 'KB JS');
  return out;
}

console.log('▶ build-deploy: assembling dist/\n');

// ── 1. Sanity-check the source before building ────────────────────────────────
for (const f of [MAIN, ...ASSETS, ...PAGES]) {
  if (!fs.existsSync(path.join(ROOT, f))) die('missing source file: ' + f);
}
const html = read(MAIN);
if (html.includes('\0')) die(MAIN + ' contains NUL bytes — a bad edit slipped in. Fix before deploying.');
let manifest;
try { manifest = JSON.parse(read('manifest.webmanifest').toString('utf8')); }
catch (e) { die('manifest.webmanifest is not valid JSON: ' + e.message); }
const swVer = (read('sw.js').toString('utf8').match(/const CACHE = '([^']+)'/) || [])[1] || '(unknown)';
console.log('  source ok · ' + MAIN + ' ' + (html.length / 1024 | 0) + 'KB · SW cache ' + swVer + '\n');

// ── 2. Fresh dist/ ────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// "/" = the marketing landing (so visitors see the pitch); the app keeps its own URL at
// /train.html (the SW + manifest reference ./train.html, which is present).
fs.writeFileSync(path.join(OUT, 'index.html'), read('landing.html'));
const distHtml = precompileBabel(html.toString('utf8'));
fs.writeFileSync(path.join(OUT, 'train.html'), distHtml);

// The installed PWA opens the APP, not the marketing page.
manifest.start_url = './train.html';
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

for (const f of ASSETS) {
  if (f === 'manifest.webmanifest') continue; // already written (patched)
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}
for (const f of PAGES) { // landing.html, privacy.html, terms.html (as-is)
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}

const built = fs.readdirSync(OUT).sort();
console.log('  dist/ built:');
for (const f of built) {
  const kb = (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1);
  console.log('    ' + f.padEnd(24) + kb + ' KB');
}

// ── 3. Deploy (optional) ──────────────────────────────────────────────────────
if (process.argv.includes('--deploy')) {
  console.log('\n▶ deploying to Cloudflare Pages (project: ' + PROJECT + ') …\n');
  try {
    execSync('npx wrangler pages deploy "' + OUT + '" --project-name=' + PROJECT, { stdio: 'inherit', cwd: ROOT });
  } catch (e) {
    die('wrangler deploy failed. Run `npx wrangler login` first, or deploy manually (see below).');
  }
  console.log('\n✓ deployed.');
} else {
  console.log('\n✓ dist/ is ready. Deploy it any of these ways (HTTPS is required for the PWA + SW):\n');
  console.log('  • Cloudflare Pages (CLI):  node build-deploy.js --deploy');
  console.log('      first time only: npx wrangler login');
  console.log('  • Cloudflare Pages (web):  dash.cloudflare.com → Workers & Pages → Create → Pages →');
  console.log('      "Upload assets" → drag the dist/ folder');
  console.log('  • Netlify:                 npx netlify deploy --prod --dir=dist');
  console.log('  • Vercel:                  npx vercel deploy --prod dist');
  console.log('\n  (Tip: bump sw.js CACHE before each deploy so returning users get fresh code.)\n');
}
