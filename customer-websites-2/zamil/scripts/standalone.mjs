/**
 * Build a single self-contained index.html that opens with Live Server.
 *
 * The Vite entry is index.vite.html — an empty <div id="root"> plus a pointer at
 * /src/main.tsx. A browser cannot run TSX, so opening that gives a white page.
 * This script produces the opposite thing: index.html, one file with the
 * compiled CSS and JS inlined, no build step needed to view it.
 *
 * The two are deliberately separate files (see vite.config.ts). When both roles
 * shared the name index.html, every build restored the empty template over the
 * built page and the site went white. Don't merge them back.
 *
 * Photographs stay as real files in public/img/ — inlining ~3 MB of JPEGs as
 * base64 would roughly double their weight. The absolute /img/ paths Vite emits
 * are rewritten to ./public/img/ so they resolve from this file's own folder.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = (...s) => join(root, ...s)

const TEMPLATE = p('index.vite.html')

// Optional filename argument so a themed variant can be built beside the
// original: THEME=lantern npm run standalone index2.html
const OUTPUT_NAME = process.argv[2] || 'index.html'
if (!/^[\w.-]+\.html$/.test(OUTPUT_NAME)) {
  console.error(`refusing to write "${OUTPUT_NAME}" — pass a plain .html filename`)
  process.exit(1)
}
if (OUTPUT_NAME === 'index.vite.html') {
  console.error('that would overwrite the Vite entry template. Pick another name.')
  process.exit(1)
}
const OUTPUT = p(OUTPUT_NAME)

if (!existsSync(TEMPLATE)) {
  console.error('index.vite.html is missing — it is the Vite entry template.')
  console.error('Recover it with: git show HEAD:index.html > index.vite.html')
  process.exit(1)
}

// 1. Compile. Vite's entry is index.vite.html (see vite.config.ts), so this
//    never touches index.html — the page people actually open stays intact
//    even if the build fails halfway.
console.log('building...')
execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' })

// 2. Pull the built page apart.
let html = readFileSync(p('dist', 'index.vite.html'), 'utf8')

const jsMatch = html.match(/<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/)
const cssMatch = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/)
if (!jsMatch) throw new Error('no bundled <script> found in dist/index.html')

const asset = (url) => readFileSync(p('dist', url.replace(/^\//, '')), 'utf8')

// A literal </script> inside the bundle would close the tag early. Escaping the
// slash is inert inside JS string literals and regexes, which is where it can
// legitimately appear.
const js = asset(jsMatch[1]).replace(/<\/script/gi, '<\\/script')
let css = cssMatch ? asset(cssMatch[1]) : ''

// 3. A theme's atmosphere layer, if it has one. The Tailwind palette covers flat
//    colour; the aurora pools and neon rim are literal rgba() in src/index.css
//    and can only be reached by overriding them after the fact.
const themeCss = process.env.THEME && p('themes', `${process.env.THEME}.css`)
if (themeCss && existsSync(themeCss)) {
  css += `\n\n/* ---- theme: ${process.env.THEME} ---- */\n${readFileSync(themeCss, 'utf8')}`
  console.log(`applied theme overlay: themes/${process.env.THEME}.css`)
}

// 4. Inline them. The replacements MUST be functions: passing the bundle as a
//    replacement string would let $&, $1, $` etc. inside it be expanded as
//    replacement patterns. React's minified source really does contain
//    .replace(ft,"$&/"), which silently corrupted the bundle when this used a
//    plain string.
html = html.replace(jsMatch[0], () => `<script type="module">\n${js}\n</script>`)
if (cssMatch) html = html.replace(cssMatch[0], () => `<style>\n${css}\n</style>`)

// 5. Repoint assets at public/. Vite serves public/ from the site root, but this
//    file sits in the project root where those files live under public/.
//    Anchored to the opening quote so only URL literals are touched.
html = html
  .replace(/(["'(])\/img\//g, '$1./public/img/')
  .replace(/(["'(])\/favicon\.svg/g, '$1./public/favicon.svg')

writeFileSync(OUTPUT, html)
rmSync(p('dist'), { recursive: true, force: true })

const kb = (n) => `${(n / 1024).toFixed(0)} kB`
console.log(`\n${OUTPUT_NAME} is now self-contained — ${kb(Buffer.byteLength(html))}`)
console.log(`  inlined JS  ${kb(Buffer.byteLength(js))}`)
console.log(`  inlined CSS ${kb(Buffer.byteLength(css))}`)
console.log('\nOpen index.html with Live Server. Edit source freely — npm run dev is unaffected.')
