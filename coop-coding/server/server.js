// Coop sync server
// - one Y.Doc per coop, in memory; a coop wakes on the first connection and
//   is dropped when the last person leaves
// - coop *metadata* (name, invite tokens) persists in data/coops.json
// - speaks the standard y-websocket wire protocol, with one addition: every
//   connection must present a token, and a viewer's writes are refused here on
//   the server rather than only in the client

import http from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { createCoop, getCoop, roleFor, rotateToken, tokenForRole, count } from './coops-store.js'

const PORT = process.env.PORT || 1234

const MSG_SYNC = 0
const MSG_AWARENESS = 1

const SYNC_STEP1 = 0
const SYNC_STEP2 = 1
const SYNC_UPDATE = 2

/** @type {Map<string, Coop>} */
const live = new Map()

class Coop {
  constructor (coopId, name) {
    this.id = coopId
    this.name = name
    this.doc = new Y.Doc()
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.awareness.setLocalState(null)
    this.conns = new Map() // conn -> { role, controlled:Set<number> }

    this.doc.on('update', update => {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.broadcast(encoding.toUint8Array(enc))
    })

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed)
      const meta = this.conns.get(origin)
      if (meta) {
        added.forEach(id => meta.controlled.add(id))
        removed.forEach(id => meta.controlled.delete(id))
      }
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      )
      this.broadcast(encoding.toUint8Array(enc))
    })
  }

  broadcast (msg) {
    this.conns.forEach((_meta, conn) => {
      if (conn.readyState === conn.OPEN) conn.send(msg)
    })
  }
}

function wake (coopId) {
  let coop = live.get(coopId)
  if (!coop) {
    const meta = getCoop(coopId)
    coop = new Coop(coopId, meta?.name ?? coopId)
    live.set(coopId, coop)
    log(`coop "${coop.name}" (${coopId}) is now ONLINE`)
  }
  return coop
}

function log (msg) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${msg}`)
}

function onConnection (conn, coop, role) {
  conn.binaryType = 'arraybuffer'
  coop.conns.set(conn, { role, controlled: new Set() })
  log(`+ ${role} joined "${coop.name}" (${coop.conns.size} online)`)

  {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MSG_SYNC)
    syncProtocol.writeSyncStep1(enc, coop.doc)
    conn.send(encoding.toUint8Array(enc))
  }

  const states = coop.awareness.getStates()
  if (states.size > 0) {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MSG_AWARENESS)
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(coop.awareness, Array.from(states.keys()))
    )
    conn.send(encoding.toUint8Array(enc))
  }

  conn.on('message', data => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data))
      switch (decoding.readVarUint(decoder)) {
        case MSG_SYNC: {
          const syncType = decoding.readVarUint(decoder)
          if (syncType === SYNC_STEP1) {
            const enc = encoding.createEncoder()
            encoding.writeVarUint(enc, MSG_SYNC)
            syncProtocol.writeSyncStep2(enc, coop.doc, decoding.readVarUint8Array(decoder))
            conn.send(encoding.toUint8Array(enc))
          } else if (syncType === SYNC_STEP2 || syncType === SYNC_UPDATE) {
            // The whole point of the viewer role. Enforced here, not in the
            // client, because a client is just someone else's code.
            if (role === 'viewer') return
            Y.applyUpdate(coop.doc, decoding.readVarUint8Array(decoder), conn)
          }
          break
        }
        case MSG_AWARENESS: {
          // Viewers still get a cursor - seeing where someone is reading is
          // useful and cannot damage anything.
          awarenessProtocol.applyAwarenessUpdate(
            coop.awareness,
            decoding.readVarUint8Array(decoder),
            conn
          )
          break
        }
      }
    } catch (err) {
      console.error('message failed:', err)
    }
  })

  const cleanup = () => {
    const meta = coop.conns.get(conn)
    if (meta) {
      awarenessProtocol.removeAwarenessStates(coop.awareness, Array.from(meta.controlled), null)
      coop.conns.delete(conn)
    }
    log(`- someone left "${coop.name}" (${coop.conns.size} online)`)
    if (coop.conns.size === 0) {
      live.delete(coop.id)
      coop.doc.destroy()
      log(`coop "${coop.name}" is now OFFLINE`)
    }
  }

  conn.on('close', cleanup)
  conn.on('error', cleanup)
}

// ------------------------------------------------------------------ http api

function json (res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody (req) {
  return new Promise(resolve => {
    let raw = ''
    req.on('data', c => { raw += c; if (raw.length > 10_000) req.destroy() })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && parts.length === 0) {
    return json(res, 200, {
      ok: true,
      coopsKnown: count(),
      online: Array.from(live.values()).map(r => ({ name: r.name, people: r.conns.size }))
    })
  }

  // POST /api/coops  { name }  -> a new coop and its three invite tokens
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'coops' && parts.length === 2) {
    const body = await readBody(req)
    const coop = createCoop(String(body.name || 'coop').slice(0, 80))
    log(`coop "${coop.name}" (${coop.coopId}) created`)
    return json(res, 200, coop)
  }

  // GET /api/coops/:id?t=token -> checks a token before we bother connecting
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'coops' && parts.length === 3) {
    const coopId = parts[2]
    const meta = getCoop(coopId)
    if (!meta) return json(res, 404, { error: 'ไม่พบ co-op นี้' })
    const role = roleFor(coopId, url.searchParams.get('t'))
    if (!role) return json(res, 401, { error: 'invite code ไม่ถูกต้องหรือถูกยกเลิกไปแล้ว' })
    const onlineCoop = live.get(coopId)
    return json(res, 200, {
      coopId,
      name: meta.name,
      role,
      online: onlineCoop ? onlineCoop.conns.size : 0
    })
  }

  // POST /api/coops/:id/rotate { role }  (owner only) -> kills a leaked invite
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'coops' && parts.length === 4 && parts[3] === 'rotate') {
    const coopId = parts[2]
    if (roleFor(coopId, url.searchParams.get('t')) !== 'owner') {
      return json(res, 403, { error: 'ต้องเป็น owner เท่านั้น' })
    }
    const body = await readBody(req)
    const token = rotateToken(coopId, body.role)
    if (!token) return json(res, 400, { error: 'role ไม่ถูกต้อง' })
    log(`coop ${coopId}: rotated the ${body.role} invite`)
    return json(res, 200, { role: body.role, token })
  }

  // GET /api/coops/:id/invite?t=token&role=editor  (owner only)
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'coops' && parts.length === 4 && parts[3] === 'invite') {
    const coopId = parts[2]
    if (roleFor(coopId, url.searchParams.get('t')) !== 'owner') {
      return json(res, 403, { error: 'ต้องเป็น owner เท่านั้น' })
    }
    const role = url.searchParams.get('role') || 'editor'
    const token = tokenForRole(coopId, role)
    if (!token) return json(res, 400, { error: 'role ไม่ถูกต้อง' })
    return json(res, 200, { role, token })
  }

  json(res, 404, { error: 'not found' })
})

// ----------------------------------------------------------------- websocket

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  const coopId = decodeURIComponent(url.pathname.slice(1).split('?')[0])
  const token = url.searchParams.get('t')

  const role = roleFor(coopId, token)
  if (!role) {
    // Refused before the websocket exists, so an unauthorised client never
    // sees a single byte of anyone's code.
    log(`! rejected a connection to "${coopId}" (bad or missing invite)`)
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, conn => onConnection(conn, wake(coopId), role))
})

setInterval(() => {
  live.forEach(coop => coop.conns.forEach((_m, conn) => conn.ping()))
}, 30000)

server.listen(PORT, () => log(`coop server listening on ws://localhost:${PORT}`))
