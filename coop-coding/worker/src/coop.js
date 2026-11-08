// One Durable Object per co-op.
//
// It holds the shared Y.Doc, the invite tokens, and every websocket in the
// co-op. Because Cloudflare guarantees a single instance per object id, there
// is exactly one copy of the document - no split brain, no sticky routing to
// configure.
//
// Hibernation is what makes this free: an idle co-op is evicted from memory
// and stops costing anything, then wakes on the next message. The catch is
// that waking runs the constructor again with an empty Y.Doc, so the document
// MUST be persisted to storage - which is also how a co-op now survives
// everyone leaving.

import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

const SYNC_STEP1 = 0
const SYNC_STEP2 = 1
const SYNC_UPDATE = 2

const ROLES = ['owner', 'editor', 'viewer']

/** How long to sit on document changes before writing them down. */
const PERSIST_DELAY_MS = 2000

/** Nobody needs this many editors, and it caps how much memory one co-op can take. */
const MAX_SOCKETS = 32

/**
 * A co-op that grows past this stops accepting edits. The free plan gives 5 GB
 * for the whole account, so one runaway co-op must not be able to eat it.
 */
const MAX_DOC_BYTES = 25 * 1024 * 1024

/** Wrong invites allowed per caller before we stop answering for a while. */
const MAX_AUTH_FAILURES = 10
const AUTH_WINDOW_MS = 10 * 60 * 1000

function json (body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

function randomId (bytes) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export class Coop {
  constructor (ctx, env) {
    this.ctx = ctx
    this.env = env

    this.doc = new Y.Doc()
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.awareness.setLocalState(null)
    this.meta = null
    this.frozen = false
    /** caller key -> { count, start }. In memory is fine: an attacker hammering
     *  us keeps the object awake, and a slow attacker is not a flood. */
    this.authFailures = new Map()

    // Nothing else may run until we have read ourselves back from storage.
    ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get('meta')) ?? null
      this.frozen = (await ctx.storage.get('frozen')) === true
      const saved = await ctx.storage.get('doc')
      if (saved) Y.applyUpdate(this.doc, new Uint8Array(saved), 'storage')
    })

    this.doc.on('update', update => {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.broadcast(encoding.toUint8Array(enc))
      this.schedulePersist()
    })

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed)
      this.rememberOwnership(origin, added, removed)
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      )
      this.broadcast(encoding.toUint8Array(enc))
    })
  }

  // ------------------------------------------------------------- persistence

  schedulePersist () {
    // An alarm survives hibernation, and coalescing writes keeps us well under
    // the free plan's daily write allowance.
    this.ctx.waitUntil((async () => {
      const existing = await this.ctx.storage.getAlarm()
      if (existing === null) await this.ctx.storage.setAlarm(Date.now() + PERSIST_DELAY_MS)
    })())
  }

  async alarm () {
    await this.persist()
  }

  async persist () {
    if (this.meta?.closed) return
    const update = Y.encodeStateAsUpdate(this.doc)
    if (update.byteLength > MAX_DOC_BYTES && !this.frozen) {
      this.frozen = true
      await this.ctx.storage.put('frozen', true)
      console.warn(`co-op ${this.meta?.coopId} hit the size cap and is now read-only`)
    }
    await this.ctx.storage.put('doc', update)
  }

  // ----------------------------------------------------------- abuse control

  /** Returns a 429 when this caller has guessed wrong too many times. */
  throttled (request) {
    const key = request.headers.get('X-Caller-Key') || 'unknown'
    const rec = this.authFailures.get(key)
    if (!rec) return null
    if (Date.now() - rec.start >= AUTH_WINDOW_MS) {
      this.authFailures.delete(key)
      return null
    }
    if (rec.count < MAX_AUTH_FAILURES) return null
    const retryAfter = Math.ceil((rec.start + AUTH_WINDOW_MS - Date.now()) / 1000)
    return json(
      { error: 'ใส่ invite ผิดหลายครั้งเกินไป ลองใหม่อีกที', retryAfterSeconds: retryAfter },
      429,
      { 'retry-after': String(retryAfter) }
    )
  }

  noteAuthFailure (request) {
    const key = request.headers.get('X-Caller-Key') || 'unknown'
    const now = Date.now()
    const rec = this.authFailures.get(key)
    if (!rec || now - rec.start >= AUTH_WINDOW_MS) {
      this.authFailures.set(key, { count: 1, start: now })
    } else {
      rec.count++
    }
  }

  // -------------------------------------------------------------- websockets

  broadcast (msg) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg)
      } catch {
        // a socket that died between the check and the send is not our problem
      }
    }
  }

  /**
   * Awareness client ids belong to a connection. We keep them on the socket's
   * attachment rather than in a Map, because a Map does not survive
   * hibernation and we would then never clean up their cursor.
   */
  rememberOwnership (origin, added, removed) {
    if (!origin || typeof origin.serializeAttachment !== 'function') return
    let att
    try {
      att = origin.deserializeAttachment() ?? {}
    } catch {
      return
    }
    const ids = new Set(att.ids ?? [])
    added.forEach(id => ids.add(id))
    removed.forEach(id => ids.delete(id))
    origin.serializeAttachment({ ...att, ids: Array.from(ids) })
  }

  roleFor (token) {
    if (!this.meta || !token) return null
    return this.meta.tokens[token] ?? null
  }

  async fetch (request) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/+/, '')
    const token = url.searchParams.get('t')

    // ---- called by the worker when a co-op is first created
    if (path === 'init' && request.method === 'POST') {
      if (this.meta) return json({ error: 'co-op นี้มีอยู่แล้ว' }, 409)
      const body = await request.json()
      this.meta = {
        coopId: body.coopId,
        name: body.name,
        folderName: body.folderName || body.name,
        created: new Date().toISOString(),
        tokens: Object.fromEntries(Object.entries(body.tokens).map(([role, t]) => [t, role]))
      }
      await this.ctx.storage.put('meta', this.meta)
      return json({ ok: true })
    }

    if (!this.meta) return json({ error: 'ไม่พบ co-op นี้' }, 404)

    // A closed co-op still answers, so an old invite says what happened
    // instead of quietly landing in an empty room nobody is sitting in.
    if (this.meta.closed) {
      if (request.headers.get('Upgrade') === 'websocket') {
        return new Response('co-op นี้ถูกเจ้าของปิดแล้ว', { status: 410 })
      }
      return json({
        error: 'co-op นี้ถูกเจ้าของปิดแล้ว (เจ้าของสร้างห้องใหม่) - ขอ invite ใหม่จากเจ้าของ',
        closed: true
      }, 410)
    }

    // ---- websocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const blocked = this.throttled(request)
      if (blocked) return blocked

      const role = this.roleFor(token)
      if (!role) {
        this.noteAuthFailure(request)
        // Refused before the socket exists, so nobody without an invite ever
        // sees a byte of anyone's code.
        return new Response('invite ไม่ถูกต้อง', { status: 401 })
      }

      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
        return new Response('co-op นี้มีคนเต็มแล้ว', { status: 503 })
      }
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({ role, ids: [] })

      {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MSG_SYNC)
        syncProtocol.writeSyncStep1(enc, this.doc)
        server.send(encoding.toUint8Array(enc))
      }

      const states = this.awareness.getStates()
      if (states.size > 0) {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MSG_AWARENESS)
        encoding.writeVarUint8Array(
          enc,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys()))
        )
        server.send(encoding.toUint8Array(enc))
      }

      return new Response(null, { status: 101, webSocket: client })
    }

    // ---- GET info
    if (path === 'info' && request.method === 'GET') {
      const blocked = this.throttled(request)
      if (blocked) return blocked
      const role = this.roleFor(token)
      if (!role) {
        this.noteAuthFailure(request)
        return json({ error: 'invite code ไม่ถูกต้องหรือถูกยกเลิกไปแล้ว' }, 401)
      }
      return json({
        coopId: this.meta.coopId,
        name: this.meta.name,
        folderName: this.meta.folderName || this.meta.name,
        role,
        online: this.ctx.getWebSockets().length,
        readOnly: this.frozen
      })
    }

    // ---- GET invite?role=editor   (owner only)
    if (path === 'invite' && request.method === 'GET') {
      const blocked = this.throttled(request)
      if (blocked) return blocked
      if (this.roleFor(token) !== 'owner') {
        this.noteAuthFailure(request)
        return json({ error: 'ต้องเป็น owner เท่านั้น' }, 403)
      }
      const role = url.searchParams.get('role') || 'editor'
      const found = Object.entries(this.meta.tokens).find(([, r]) => r === role)
      if (!found) return json({ error: 'role ไม่ถูกต้อง' }, 400)
      return json({ role, token: found[0] })
    }

    // ---- POST rotate  { role }   (owner only)
    if (path === 'rotate' && request.method === 'POST') {
      const blocked = this.throttled(request)
      if (blocked) return blocked
      if (this.roleFor(token) !== 'owner') {
        this.noteAuthFailure(request)
        return json({ error: 'ต้องเป็น owner เท่านั้น' }, 403)
      }
      const body = await request.json().catch(() => ({}))
      const role = body.role
      if (!ROLES.includes(role)) return json({ error: 'role ไม่ถูกต้อง' }, 400)

      for (const [t, r] of Object.entries(this.meta.tokens)) {
        if (r === role) delete this.meta.tokens[t]
      }
      const fresh = randomId(18)
      this.meta.tokens[fresh] = role
      await this.ctx.storage.put('meta', this.meta)

      // Anyone already connected on the old invite loses their seat.
      for (const ws of this.ctx.getWebSockets()) {
        try {
          if (ws.deserializeAttachment()?.role === role) ws.close(4401, 'invite ถูกยกเลิก')
        } catch {
          // ignore
        }
      }
      return json({ role, token: fresh })
    }

    // ---- POST close   (owner only)
    // Used when the owner makes a fresh co-op for the same folder. The tokens
    // and the document go; a tombstone stays so old invites get a clear 410.
    if (path === 'close' && request.method === 'POST') {
      const blocked = this.throttled(request)
      if (blocked) return blocked
      if (this.roleFor(token) !== 'owner') {
        this.noteAuthFailure(request)
        return json({ error: 'ต้องเป็น owner เท่านั้น' }, 403)
      }
      this.meta = {
        coopId: this.meta.coopId,
        name: this.meta.name,
        folderName: this.meta.folderName,
        created: this.meta.created,
        closed: new Date().toISOString(),
        tokens: {}
      }
      await this.ctx.storage.put('meta', this.meta)
      await this.ctx.storage.delete('doc')
      await this.ctx.storage.deleteAlarm()
      this.doc.destroy()
      this.doc = new Y.Doc()
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(4410, 'co-op ถูกปิด') } catch { /* ignore */ }
      }
      return json({ ok: true })
    }

    return json({ error: 'not found' }, 404)
  }

  // ------------------------------------------------- hibernation-aware events

  async webSocketMessage (ws, message) {
    const role = (() => {
      try {
        return ws.deserializeAttachment()?.role ?? null
      } catch {
        return null
      }
    })()
    if (!role) return

    const bytes = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : new Uint8Array(message)

    try {
      const decoder = decoding.createDecoder(bytes)
      switch (decoding.readVarUint(decoder)) {
        case MSG_SYNC: {
          const syncType = decoding.readVarUint(decoder)
          if (syncType === SYNC_STEP1) {
            const enc = encoding.createEncoder()
            encoding.writeVarUint(enc, MSG_SYNC)
            syncProtocol.writeSyncStep2(enc, this.doc, decoding.readVarUint8Array(decoder))
            ws.send(encoding.toUint8Array(enc))
          } else if (syncType === SYNC_STEP2 || syncType === SYNC_UPDATE) {
            // The viewer rule, enforced on the server because a client is
            // someone else's code.
            if (role === 'viewer') return
            if (this.frozen) return
            Y.applyUpdate(this.doc, decoding.readVarUint8Array(decoder), ws)
          }
          break
        }
        case MSG_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          )
          break
        }
      }
    } catch (err) {
      console.error('message failed', err)
    }
  }

  async webSocketClose (ws) {
    this.dropCursor(ws)
    if (this.ctx.getWebSockets().length <= 1) await this.persist()
  }

  async webSocketError (ws) {
    this.dropCursor(ws)
  }

  dropCursor (ws) {
    try {
      const ids = ws.deserializeAttachment()?.ids ?? []
      if (ids.length > 0) awarenessProtocol.removeAwarenessStates(this.awareness, ids, null)
    } catch {
      // nothing to clean up
    }
  }
}
