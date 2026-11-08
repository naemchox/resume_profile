// One Durable Object per rate-limit bucket (usually per IP).
//
// Counters live in storage rather than memory on purpose: an attacker who
// drips one request every few minutes would let the object hibernate, and an
// in-memory counter would reset every time - which is exactly the pattern a
// limiter needs to catch.

// Deliberately generous: a real person makes a handful of co-ops, while an
// abuser needs thousands to hurt us. Tight enough to stop a flood, loose
// enough that nobody normal ever meets it. Override with vars to tighten.
const DEFAULT_PER_HOUR = 20
const DEFAULT_PER_DAY = 100

function windowsFor (env) {
  return [
    { key: 'hour', ms: 60 * 60 * 1000, max: Number(env?.CREATE_PER_HOUR) || DEFAULT_PER_HOUR },
    { key: 'day', ms: 24 * 60 * 60 * 1000, max: Number(env?.CREATE_PER_DAY) || DEFAULT_PER_DAY }
  ]
}

function json (body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

export class Limiter {
  constructor (ctx, env) {
    this.ctx = ctx
    this.env = env
  }

  async fetch () {
    const WINDOWS = windowsFor(this.env)
    const now = Date.now()
    const state = (await this.ctx.storage.get('windows')) ?? {}

    for (const w of WINDOWS) {
      const cur = state[w.key]
      if (!cur || now - cur.start >= w.ms) state[w.key] = { start: now, count: 0 }
    }

    let retryAfter = 0
    for (const w of WINDOWS) {
      if (state[w.key].count >= w.max) {
        retryAfter = Math.max(retryAfter, Math.ceil((state[w.key].start + w.ms - now) / 1000))
      }
    }

    if (retryAfter > 0) {
      return json(
        {
          error: 'สร้าง co-op ถี่เกินไป ลองใหม่อีกที',
          retryAfterSeconds: retryAfter
        },
        429,
        { 'retry-after': String(retryAfter) }
      )
    }

    for (const w of WINDOWS) state[w.key].count++
    await this.ctx.storage.put('windows', state)

    // Let the bucket expire on its own so we are not storing a row per IP forever.
    const longest = Math.max(...WINDOWS.map(w => w.ms))
    await this.ctx.storage.setAlarm(now + longest + 60_000)

    return json({
      ok: true,
      remaining: Math.min(...WINDOWS.map(w => w.max - state[w.key].count))
    })
  }

  async alarm () {
    // The bucket is stale by now; drop it rather than keep a row per IP forever.
    await this.ctx.storage.deleteAll()
  }
}
