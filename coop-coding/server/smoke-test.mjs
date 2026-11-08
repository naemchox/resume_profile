// Checks sync + invite codes + roles without opening VS Code.
// Run the server first, then: node smoke-test.mjs
import * as Y from 'yjs'
import WS from 'ws'
import { WebsocketProvider } from 'y-websocket'

const HTTP = process.env.HTTP || 'http://localhost:1234'
const WSURL = process.env.WSURL || 'ws://localhost:1234'

const wait = ms => new Promise(r => setTimeout(r, ms))
const results = []
function check (label, ok) {
  results.push({ label, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

function client (name, coopId, token) {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(WSURL, coopId, doc, {
    WebSocketPolyfill: WS,
    disableBc: true,
    params: { t: token }
  })
  provider.awareness.setLocalStateField('user', { name })
  return { name, doc, provider, files: doc.getMap('files') }
}

// ---------------------------------------------------------------- create

const created = await (await fetch(`${HTTP}/api/coops`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'smoke test coop' })
})).json()

check('สร้าง coop แล้วได้ token ครบสามระดับ',
  !!created.coopId && !!created.tokens.owner && !!created.tokens.editor && !!created.tokens.viewer)

const { coopId, tokens } = created

// ---------------------------------------------------------------- token checks

const good = await fetch(`${HTTP}/api/coops/${coopId}?t=${tokens.editor}`)
check('token ที่ถูกต้องผ่าน และบอก role กลับมา',
  good.status === 200 && (await good.json()).role === 'editor')

const bad = await fetch(`${HTTP}/api/coops/${coopId}?t=totally-wrong`)
check('token มั่วโดนปฏิเสธ (401)', bad.status === 401)

const missing = await fetch(`${HTTP}/api/coops/does-not-exist?t=${tokens.editor}`)
check('coop ที่ไม่มีอยู่ตอบ 404', missing.status === 404)

// websocket ต้องถูกปฏิเสธตั้งแต่ตอน upgrade
const rejected = await new Promise(resolve => {
  const sock = new WS(`${WSURL}/${coopId}?t=totally-wrong`)
  const done = v => { try { sock.terminate() } catch {} ; resolve(v) }
  sock.on('unexpected-response', (_req, res) => done(res.statusCode))
  sock.on('error', () => done('error'))
  sock.on('open', () => done('opened'))
  setTimeout(() => done('timeout'), 3000)
})
check('websocket ที่ไม่มี invite ถูกปฏิเสธก่อนเห็นข้อมูล', rejected === 401)

// ---------------------------------------------------------------- editing

const a = client('alice', coopId, tokens.owner)
const b = client('bob', coopId, tokens.editor)
await wait(700)

const t = new Y.Text()
t.insert(0, 'hello')
a.files.set('app.js', t)
await wait(400)
check('editor เห็นไฟล์ที่ owner สร้าง', b.files.get('app.js')?.toString() === 'hello')

a.files.get('app.js').insert(5, ' from alice')
b.files.get('app.js').insert(0, 'BOB: ')
await wait(500)
const textA = a.files.get('app.js').toString()
check('แก้พร้อมกันแล้ว converge', textA === b.files.get('app.js').toString())
check('ไม่มีใครเสียข้อความ', textA.includes('alice') && textA.includes('BOB'))
console.log(`      -> "${textA}"`)

check('เห็นกันใน awareness',
  [...a.provider.awareness.getStates().values()].some(s => s?.user?.name === 'bob'))

// ---------------------------------------------------------------- viewer

const v = client('viewer', coopId, tokens.viewer)
await wait(700)
check('viewer อ่านไฟล์ได้', v.files.get('app.js')?.toString() === textA)

v.files.get('app.js').insert(0, 'VIEWER WAS HERE ')
await wait(600)
check('เซิร์ฟเวอร์ไม่รับการแก้จาก viewer',
  !a.files.get('app.js').toString().includes('VIEWER'))
check('คนอื่นก็ไม่เห็นการแก้ของ viewer',
  !b.files.get('app.js').toString().includes('VIEWER'))

// ---------------------------------------------------------------- reconnect

b.provider.disconnect()
await wait(300)
a.files.get('app.js').insert(a.files.get('app.js').length, '\n// added while bob was away')
await wait(300)
b.provider.connect()
await wait(800)
check('กลับมาแล้วตามงานที่พลาดได้ครบ',
  b.files.get('app.js').toString() === a.files.get('app.js').toString())

// ---------------------------------------------------------------- rotate

const rotated = await (await fetch(`${HTTP}/api/coops/${coopId}/rotate?t=${tokens.owner}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ role: 'editor' })
})).json()
const oldTokenNow = await fetch(`${HTTP}/api/coops/${coopId}?t=${tokens.editor}`)
check('ยกเลิก invite เก่าได้ ของเดิมใช้ไม่ได้แล้ว',
  !!rotated.token && rotated.token !== tokens.editor && oldTokenNow.status === 401)

const notOwner = await fetch(`${HTTP}/api/coops/${coopId}/rotate?t=${tokens.viewer}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ role: 'editor' })
})
check('คนที่ไม่ใช่ owner ยกเลิก invite ไม่ได้', notOwner.status === 403)

a.provider.destroy()
b.provider.destroy()
v.provider.destroy()

const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed === 0 ? 0 : 1)
