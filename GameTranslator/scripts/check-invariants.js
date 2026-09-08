#!/usr/bin/env node
// Cross-file checks that no single file can make for itself. Run it after any edit that touches more
// than one of HTML / JS / CSS / i18n — and ALWAYS after a bulk regex rewrite, which is how the one
// real breakage so far happened (a `data-desc` attribute landed on the row above the one it described,
// silently, because the pattern matched across two rows).
//
//   node scripts/check-invariants.js
//
// Exit code 1 if anything is wrong, so it can gate a commit.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const problems = [];
const note = (where, msg) => problems.push(`${where}: ${msg}`);

// Each renderer is a self-contained trio: markup, script, dictionary.
const RENDERERS = [
  { name: 'main', html: 'renderer/main/index.html', js: 'renderer/main/index.js', i18n: 'renderer/main/i18n.js' },
  { name: 'learn', html: 'renderer/learn/index.html', js: 'renderer/learn/index.js', i18n: 'renderer/learn/i18n.js' },
];

for (const r of RENDERERS) {
  const html = read(r.html);
  const js = read(r.js);
  const i18n = read(r.i18n);

  // 1. Every getElementById the script asks for must exist in the markup. Catches an id renamed or
  //    dropped on one side only — which throws at load and takes the whole renderer with it.
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of js.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
    if (!ids.has(m[1])) note(r.js, `getElementById('${m[1]}') has no matching id in ${path.basename(r.html)}`);
  }

  // 2. Every translation key the markup names must exist in EVERY language, not just English —
  //    a key present in `en` only silently falls back and the Thai UI shows English.
  const dicts = [...i18n.matchAll(/^\s{4}(\w+):\s*\{$/gm)].map((m) => m[1]);
  if (dicts.length < 2) note(r.i18n, `expected at least 2 language dictionaries, found ${dicts.length}`);
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html|-title|-ph|-tip)?="([^"]+)"/g)) keys.add(m[1]);
  // The settings description bar names its strings by key too, in data-desc / data-desc-default.
  for (const m of html.matchAll(/data-desc(?:-default)?="([\w.]+)"/g)) keys.add(m[1]);
  for (const key of keys) {
    const found = (i18n.match(new RegExp(`'${key.replace(/\./g, '\\.')}'\\s*:`, 'g')) || []).length;
    if (found === 0) note(r.i18n, `key '${key}' is used in ${path.basename(r.html)} but defined nowhere`);
    else if (found < dicts.length) note(r.i18n, `key '${key}' is defined ${found}× but there are ${dicts.length} languages`);
  }
}

// 3. THE BUG THIS FILE EXISTS FOR. A settings row's description must sit on the row it describes.
//    Both are only ever attributes on the same element, so nothing else can catch a one-row slip.
//    Convention: data-desc="desc.<thing>" belongs on the row whose label is lbl.<thing>/toggle.<thing>.
{
  const lines = read('renderer/main/index.html').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const desc = (lines[i].match(/data-desc="desc\.(\w+)"/) || [])[1];
    if (!desc) continue;
    let label = null;
    for (let j = i; j < Math.min(i + 8, lines.length); j++) {
      const m = lines[j].match(/data-i18n="(?:lbl|toggle)\.(\w+)"/);
      if (m) { label = m[1]; break; }
    }
    if (!label) note(`renderer/main/index.html:${i + 1}`, `data-desc="desc.${desc}" is on a row with no label`);
    else if (label.toLowerCase() !== desc.toLowerCase()) {
      note(`renderer/main/index.html:${i + 1}`, `data-desc="desc.${desc}" sits on the row labelled '${label}' — it describes the wrong setting`);
    }
  }
}

// 4. Anything the renderer persists has to survive the round trip through main: DEFAULT_SETTINGS
//    defines it, uiSettings() hands it back. Miss either and the setting resets on every launch.
{
  const main = read('main.js');
  const uiBlock = (main.match(/function uiSettings\(\)[\s\S]*?\n}/) || [''])[0];
  for (const m of read('renderer/main/index.js').matchAll(/setSettings\(\{\s*(\w+)/g)) {
    const key = m[1];
    if (!new RegExp(`^\\s*${key}:`, 'm').test(main)) note('main.js', `renderer saves '${key}' but DEFAULT_SETTINGS has no such key`);
    else if (!uiBlock.includes(key)) note('main.js', `'${key}' is in DEFAULT_SETTINGS but uiSettings() never returns it — it will never reach the UI`);
  }
}

// 5. Anything main.js requires, and anything it opens at runtime, has to be inside the shipped app.
//    build.files REPLACES electron-builder's default `**/*`, so adding a file to the repo does not add
//    it to the package -- and nothing says so until the installed build dies on launch with
//    MODULE_NOT_FOUND. `npm start` reads from disk and is happy either way, which is why this went
//    unnoticed: winkeyhook.js arrived with the Windows hold-to-snip port and never entered the list.
{
  const main = read('main.js');
  const files = (JSON.parse(read('package.json')).build || {}).files || [];
  const covered = (rel) => files.some((pat) => {
    const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return re.test(rel);
  });
  for (const m of main.matchAll(/require\('\.\/([\w-]+)'\)/g)) {
    const rel = m[1] + '.js';
    if (!covered(rel)) note('package.json', `main.js requires ./${m[1]} but build.files does not include ${rel} — the packaged app will not start`);
  }
  // Runtime path joins off __dirname (the app icon is the live example) are packaged the same way.
  for (const m of main.matchAll(/path\.join\(__dirname,\s*'([^']+)',\s*'([^']+)'\)/g)) {
    const rel = `${m[1]}/${m[2]}`;
    if (!covered(rel)) note('package.json', `main.js reads ${rel} at runtime but build.files does not include it`);
  }
}

// 6. A name used but never declared. `node --check` only parses — it is happy with a variable that
//    does not exist, because whether it exists is a runtime question. This file went green while
//    panelIdleMs() called `log.querySelectorAll(...)` and the element was really called `logEl`: a
//    guaranteed ReferenceError on every mousemove with the History panel open, and nothing caught it.
//    Renderer scripts share one global scope, so the check is: every bare identifier that gets a
//    property read or a call must be declared SOMEWHERE across the scripts that page loads.
{
  const GLOBALS = new Set(['window', 'document', 'console', 'navigator', 'location', 'localStorage',
    'sessionStorage', 'performance', 'screen', 'history', 'Math', 'JSON', 'Object', 'Array', 'String',
    'Number', 'Boolean', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Error',
    'TypeError', 'RangeError', 'ReferenceError', 'Intl', 'URL', 'URLSearchParams', 'Blob', 'File',
    'FileReader', 'FormData', 'Headers', 'Request', 'Response', 'AbortController', 'Audio', 'Image',
    'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'DOMParser', 'Node',
    'Element', 'HTMLElement', 'CSS', 'speechSynthesis', 'SpeechSynthesisUtterance', 'IntersectionObserver',
    'MutationObserver', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone', 'fetch',
    'atob', 'btoa', 'crypto', 'globalThis', 'undefined', 'NaN', 'Infinity', 'this', 'arguments',
    'Symbol', 'Proxy', 'Reflect', 'BigInt', 'Uint8Array', 'ArrayBuffer', 'TextEncoder', 'TextDecoder']);
  // Prose is not code. Without this the scan reads the comments — which in this project are long and
  // written in English — and reports every word before a full stop as an undeclared variable ("see",
  // "while", "main.js"). 34 of them on the first run, none real.
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  for (const r of RENDERERS) {
    // Everything that shares the page's global scope, in load order.
    const scripts = [...read(r.html).matchAll(/<script src="([^"]+)"><\/script>/g)]
      .map((m) => path.posix.join(path.posix.dirname(r.html), m[1]));
    let all = '';
    for (const s of scripts) { try { all += '\n' + strip(read(s)); } catch { /* not ours to check */ } }
    const declared = new Set(GLOBALS);
    for (const m of all.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
    for (const m of all.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) {          // destructuring
      for (const part of m[1].split(',')) { const n = part.split(':').pop().split('=')[0].trim(); if (n) declared.add(n); }
    }
    for (const m of all.matchAll(/(?:function\s*[\w$]*\s*|\)\s*=>|\(\s*)\(?([^)]*)\)?\s*(?:=>|\{)/g)) {
      for (const part of m[1].split(',')) { const n = part.split('=')[0].replace(/[{}[\].]/g, '').trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n); }
    }
    const js = strip(read(r.js));
    const seen = new Set();
    for (const m of js.matchAll(/(^|[^.\w$'"`])([A-Za-z_$][\w$]*)\s*(?=\.[A-Za-z_$])/g)) {
      const name = m[2];
      if (declared.has(name) || seen.has(name) || /^[A-Z]/.test(name)) continue;
      seen.add(name);
      note(r.js, `'${name}' is used but never declared in the scripts ${path.basename(r.html)} loads — that is a ReferenceError the moment the line runs`);
    }
  }
}

// 7. A regex literal that lost a backslash. Both `\p{L}` written as `p{L}` and `\s+` written as `s+`
//    stay perfectly valid JavaScript — they just mean something else, quietly. Shipped twice on
//    2026-08-09: `/^[^p{L}p{N}]+|...$/gu` became "strip everything that is not one of p { L } N",
//    so looking up "apple" looked up "pp" and the word was saved with the wrong meaning; and
//    `.replace(/s+/g, ' ')` deleted the letter s from every line it tidied. node --check parses both
//    happily and check 6 sees no undeclared name, so nothing else in this file could have caught them.
{
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const SKIP_DIR = /^(node_modules|dist|build|out|\.git|\.wktest)$/;
  const SKIP_FILE = new Set(['scripts/check-invariants.js']); // it quotes the very patterns it hunts
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir || '.'), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(rel); }
      else if (e.name.endsWith('.js') && !SKIP_FILE.has(rel)) files.push(rel);
    }
  };
  walk('');
  // A regex literal only where one can legally start — after an operator, a comma, an open bracket.
  // Anywhere else a slash is division, and reading that as a pattern invents matches out of arithmetic.
  const LITERAL = /(?:^|[=(,:!&|?+\-*%;[{}\n]|\breturn\b)\s*(\/(?![*\/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\\n])+\/[dgimsuvy]*)/g;
  const LOST_P = /(?:^|[^\\])[pP]\{/;                 // \p{L} without its backslash
  const LOST_CLASS = /^\^?[sSdDwWbB][+*?]?\$?$/;      // a whole pattern that is just `s+`, `d+`, `w`…
  for (const rel of files) {
    let src;
    try { src = strip(read(rel)); } catch { continue; }
    for (const m of src.matchAll(LITERAL)) {
      const body = m[1].slice(1, m[1].lastIndexOf('/'));
      const line = src.slice(0, m.index).split('\n').length;
      if (LOST_P.test(body)) note(`${rel}:${line}`, `${m[1]} — 'p{' with no backslash matches the letters p { L }, not a Unicode property. Meant \\p{…}?`);
      else if (LOST_CLASS.test(body)) note(`${rel}:${line}`, `${m[1]} — matches the literal letter, not a character class. Meant \\${body.replace(/[\^$]/g, '')}?`);
    }
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} problem${problems.length > 1 ? 's' : ''}:\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('✓ ids, translations, settings-row descriptions and settings plumbing all line up');
