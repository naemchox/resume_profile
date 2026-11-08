// Worker-only: proves a co-op survives everyone leaving.
// The node server in ../server keeps documents in RAM and would fail this.
// Run `npm run dev` in this folder first, then: node persist-test.mjs
import * as Y from 'yjs'
import WS from 'ws'
import { WebsocketProvider } from 'y-websocket'

const HTTP = process.env.HTTP || 'http://localhost:8787'
const WSURL = process.env.WSURL || 'ws://localhost:8787'

const wait = ms => new Promise(r => setTimeout(r, ms))
const results = []
const check = (label, ok) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`) }

function connect (coopId, token) {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(WSURL, coopId, doc, {
    WebSocketPolyfill: WS, disableBc: true, params: { t: token }
  })
  return { doc, provider, files: doc.getMap('files') }
}

const created = await (await fetch(`${HTTP}/api/coops`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'persist test' })
})).json()
const { coopId, tokens } = created

// เขียนงานลงไป แล้วออกให้หมด
const a = connect(coopId, tokens.owner)
await wait(700)
const t = new Y.Text()
t.insert(0, 'const answer = 42\n')
a.files.set('app.js', t)
await wait(500)
a.files.get('app.js').insert(18, '// งานที่ต้องไม่หาย\n')
// รอให้ alarm เขียนลง storage (debounce 2 วิ)
await wait(3500)
a.provider.destroy()
await wait(1500)

const info = await (await fetch(`${HTTP}/api/coops/${coopId}?t=${tokens.editor}`)).json()
check('ทุกคนออกแล้ว co-op ยังอยู่ และ invite ยังใช้ได้', info.role === 'editor' && info.online === 0)

// กลับเข้ามาใหม่ด้วย doc เปล่า - ถ้าเซิร์ฟเวอร์ไม่ได้เก็บไว้ จะได้ของว่าง
const b = connect(coopId, tokens.editor)
await wait(1500)
const back = b.files.get('app.js')?.toString() ?? ''
check('กลับเข้ามาแล้วงานยังอยู่ครบ', back.includes('const answer = 42') && back.includes('งานที่ต้องไม่หาย'))
console.log(`      -> ${JSON.stringify(back)}`)

// แก้ต่อจากของเดิมได้
b.files.get('app.js').insert(back.length, 'export default answer\n')
await wait(3500)
b.provider.destroy()
await wait(1500)

const c = connect(coopId, tokens.owner)
await wait(1500)
const final = c.files.get('app.js')?.toString() ?? ''
check('รอบที่สองก็ยังเก็บต่อได้', final.includes('export default answer'))
c.provider.destroy()

const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed === 0 ? 0 : 1)
