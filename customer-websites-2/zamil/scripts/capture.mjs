/**
 * Screenshot the built page, section by section, into assets/Web pictures/.
 *
 * Drives headless Chrome over the DevTools Protocol using Node's built-in
 * WebSocket (Node 22+), so there is no Puppeteer/Playwright dependency and no
 * second Chromium download.
 *
 * Captures, per viewport:
 *   00-age-gate.png   the gate as a first-time visitor meets it
 *   00-full-page.png  the whole page in one tall image
 *   NN-part.png       one viewport-height slice at a time, top to bottom
 *
 * Usage: node scripts/capture.mjs <baseUrl> <outDir>
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const [, , BASE_URL, OUT_DIR] = process.argv
if (!BASE_URL || !OUT_DIR) {
  console.error('usage: node scripts/capture.mjs <baseUrl> <outDir>')
  process.exit(1)
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scale: 1, mobile: false },
  { name: 'mobile', width: 390, height: 844, scale: 2, mobile: true },
]

// Reveal-on-scroll animations need a beat to finish before the shutter, or the
// slice records half-faded text.
const SETTLE_MS = 800

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  // Chrome needs a moment to open the debugging port after launch.
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list')
      const page = (await res.json()).find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('Chrome DevTools port never opened on 9222')
}

function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let nextId = 0

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    const resolver = pending.get(msg.id)
    if (!resolver) return
    pending.delete(msg.id)
    msg.error ? resolver.reject(new Error(msg.error.message)) : resolver.resolve(msg.result)
  })

  let closed = false

  // Without this a dropped socket leaves every in-flight command pending, the
  // event loop empties, and node exits silently with no clue what happened.
  ws.addEventListener('close', () => {
    closed = true
    for (const { reject } of pending.values()) {
      reject(new Error('CDP socket closed mid-command'))
    }
    pending.clear()
  })

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      if (process.env.CDP_DEBUG) console.error(`  -> ${method}`)
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  return { ready, send, close: () => ws.close(), isClosed: () => closed }
}

async function main() {
  let session = connect(await findTarget())
  await session.ready

  // Emulation overrides live on the session, so a reconnect has to re-apply
  // them or the viewport silently reverts to Chrome's default.
  let viewport = null
  const initSession = async () => {
    await session.send('Page.enable')
    await session.send('Runtime.enable')
    if (viewport) {
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.scale,
        mobile: viewport.mobile,
      })
    }
  }
  await initSession()

  // A screenshot big enough to exceed the WebSocket frame limit drops the
  // connection. Rather than lose the run, reconnect and retry once — the page
  // itself is untouched, so scroll position and the dismissed gate survive.
  const send = async (method, params = {}) => {
    try {
      return await session.send(method, params)
    } catch (err) {
      if (!/socket closed/i.test(err.message)) throw err
      console.error('  (CDP socket dropped — reconnecting)')
      session = connect(await findTarget())
      await session.ready
      await initSession()
      return session.send(method, params)
    }
  }
  const close = () => session.close()

  // awaitPromise matters: the scroll-through below is an async IIFE, and without
  // it CDP resolves with the Promise handle rather than the page height.
  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return result.value
  }

  const shoot = async (dir, name, params = {}) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', ...params })
    const file = join(dir, name)
    writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  }

  for (const vp of VIEWPORTS) {
    const dir = join(OUT_DIR, vp.name)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })

    viewport = vp
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.scale,
      mobile: vp.mobile,
    })

    // Reload rather than navigate. Chrome is launched already pointing at the
    // page: going about:blank -> http:// swaps the renderer process, which
    // silently drops the debugger session mid-run.
    await send('Page.reload', { ignoreCache: false })
    // readyState alone fires before React has painted; give the bundle a beat.
    for (let i = 0; i < 40; i++) {
      if ((await evaluate('document.readyState')) === 'complete') break
      await sleep(250)
    }
    await sleep(1500)

    // The gate now shows on every load, so it is both the first thing to
    // photograph and the thing standing between us and the rest of the page.
    await shoot(dir, '00-age-gate.png')
    console.log(`${vp.name}: gate captured, dismissing...`)

    const dismissed = await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => /20\\+/.test(b.textContent || ''))
        if (!btn) return false
        btn.click()
        return true
      })()
    `)
    if (!dismissed) throw new Error(`${vp.name}: could not find the age-gate accept button`)
    await sleep(SETTLE_MS)

    // Scroll the whole page once so every reveal animation has fired, then
    // return to the top. Otherwise the tall full-page shot is full of
    // un-revealed, invisible sections.
    const pageHeight = await evaluate(`
      (async () => {
        const step = window.innerHeight
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise(r => setTimeout(r, 220))
        }
        window.scrollTo(0, 0)
        return document.body.scrollHeight
      })()
    `)
    await sleep(SETTLE_MS)

    // The whole page in one image arrives as a single base64 message. At full
    // scale a ~9,400px-tall page overruns the WebSocket frame limit and kills
    // the connection, so scale the overview down to stay well inside it. The
    // per-section slices below are the full-resolution record.
    const FULL_PAGE_MAX_PX = 4000
    const fullScale = Math.min(vp.scale, FULL_PAGE_MAX_PX / pageHeight)
    await shoot(dir, '00-full-page.png', {
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: vp.width, height: pageHeight, scale: fullScale },
    })

    const slices = Math.ceil(pageHeight / vp.height)
    for (let i = 0; i < slices; i++) {
      const y = i * vp.height
      await evaluate(`window.scrollTo(0, ${y})`)
      await sleep(SETTLE_MS)
      const name = `${String(i + 1).padStart(2, '0')}-part.png`
      await shoot(dir, name)
      process.stdout.write(`  ${vp.name}/${name}\n`)
    }

    console.log(`${vp.name}: page ${vp.width}x${pageHeight}, ${slices} slices + full page + gate`)
  }

  close()
}

main().catch((err) => {
  console.error('capture failed:', err.message)
  process.exit(1)
})
