// Cloudflare Worker entry point.
//
// The worker itself is stateless routing. Everything that matters - the shared
// document, who may touch it, and the websockets - lives in one Durable Object
// per co-op, so every person in a co-op is talking to the same instance.
// That single-instance guarantee is the whole reason this runs on DOs rather
// than on a pool of servers.

export { Coop } from './coop.js'
export { Limiter } from './limiter.js'

const ROLES = ['owner', 'editor', 'viewer']

function json (body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function randomId (bytes) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The largest body we will read from anyone. Creating a co-op needs a name. */
const MAX_BODY_BYTES = 4096

/** wrangler dev fills CF-Connecting-IP with loopback; real traffic never does. */
const LOOPBACK = new Set(['::1', '127.0.0.1'])

/**
 * Who to charge a rate limit to.
 *
 * CF-Connecting-IP is written by Cloudflare's edge and cannot be forged by the
 * caller, so in production it is the only thing we trust. X-Forwarded-For is
 * trivially spoofable and is consulted ONLY when the edge header is loopback,
 * which happens exclusively under `wrangler dev` - that is what lets the tests
 * pretend to be several different people.
 */
function callerKey (request) {
  const edge = request.headers.get('CF-Connecting-IP')
  if (edge && !LOOPBACK.has(edge)) return edge
  return request.headers.get('X-Forwarded-For') || edge || 'local-dev'
}

/** Routes to the one Durable Object that owns this co-op. */
function stubFor (env, coopId) {
  return env.COOP.get(env.COOP.idFromName(coopId))
}

export default {
  async fetch (request, env) {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    // ---- websocket: /{coopId}?t={token}
    if (request.headers.get('Upgrade') === 'websocket') {
      const coopId = decodeURIComponent(parts[0] || '')
      if (!coopId) return new Response('missing co-op id', { status: 400 })
      const forwarded = new Request(request)
      forwarded.headers.set('X-Caller-Key', callerKey(request))
      return stubFor(env, coopId).fetch(forwarded)
    }

    if (parts.length === 0) {
      return json({ ok: true, service: 'co-op coding server' })
    }

    // ---- POST /api/coops  { name }
    if (request.method === 'POST' && parts[0] === 'api' && parts[1] === 'coops' && parts.length === 2) {
      const declared = Number(request.headers.get('content-length') || 0)
      if (declared > MAX_BODY_BYTES) {
        return json({ error: 'ข้อมูลที่ส่งมาใหญ่เกินไป' }, 413)
      }

      // Checked before we do any work, so a flood costs one cheap DO call.
      const verdict = await env.LIMITER
        .get(env.LIMITER.idFromName('create:' + callerKey(request)))
        .fetch(new Request('https://limiter/hit'))
      if (!verdict.ok) return verdict

      const raw = await request.text()
      if (raw.length > MAX_BODY_BYTES) return json({ error: 'ข้อมูลที่ส่งมาใหญ่เกินไป' }, 413)
      let body = {}
      try { body = JSON.parse(raw || '{}') } catch { body = {} }
      const coopId = randomId(8)
      const tokens = {}
      for (const role of ROLES) tokens[role] = randomId(18)
      const name = String(body.name || 'co-op').slice(0, 80)
      // The creator's own folder name. Joiners reuse it so the copy on their
      // machine is called the same thing as the original.
      const folderName = String(body.folderName || name).slice(0, 80)

      const res = await stubFor(env, coopId).fetch(
        new Request('https://do/init', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ coopId, name, folderName, tokens })
        })
      )
      if (!res.ok) return res
      return json({ coopId, name, folderName, tokens })
    }

    // ---- everything else under /api/coops/:id is the object's own business
    if (parts[0] === 'api' && parts[1] === 'coops' && parts[2]) {
      const coopId = decodeURIComponent(parts[2])
      const rest = parts.slice(3).join('/')
      const target = new URL(request.url)
      target.pathname = '/' + (rest || 'info')
      const forwarded = new Request(target, request)
      // The object needs to know who is asking so it can throttle guessing.
      forwarded.headers.set('X-Caller-Key', callerKey(request))
      return stubFor(env, coopId).fetch(forwarded)
    }

    return json({ error: 'not found' }, 404)
  }
}
