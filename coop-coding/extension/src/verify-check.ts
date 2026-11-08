// Checks the folder-vs-coop comparison without VS Code and without a server.
// Run: npm run check:verify
//
// CoopSession's constructor opens a websocket, so these build the object from
// the prototype and hand it only what verify() actually touches: the shared
// file map, the root folder, and which documents are open.
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as Y from 'yjs'
import * as vscode from 'vscode'
import { CoopSession, VerifyReport, fixable } from './coop'

const results: boolean[] = []
const check = (label: string, ok: boolean) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

function tempFolder (files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-verify-'))
  for (const [key, text] of Object.entries(files)) {
    const target = path.join(root, ...key.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text)
  }
  return root
}

function sessionFor (
  root: string,
  shared: Record<string, string>,
  openBuffers: Record<string, string> = {}
): CoopSession {
  const doc = new Y.Doc()
  const files = doc.getMap<Y.Text>('files')
  doc.transact(() => {
    for (const [key, text] of Object.entries(shared)) {
      const ytext = new Y.Text()
      ytext.insert(0, text)
      files.set(key, ytext)
    }
  })

  const session: any = Object.create(CoopSession.prototype)
  session.files = files
  session.root = vscode.Uri.file(root)
  session.chain = Promise.resolve()
  session.opts = { userName: 'ฉัน', color: '#3b82f6' }
  session.openDoc = (key: string) =>
    key in openBuffers ? { getText: () => openBuffers[key] } : undefined
  return session as CoopSession
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])
const clean = (r: VerifyReport) =>
  r.different.length + r.missingLocal.length + r.notShared.length + r.unreadable.length === 0

async function main () {
  // ---- โฟลเดอร์ที่ตรงกันทุกไฟล์
  {
    const files = { 'app.js': 'console.log(1)\n', 'web/index.html': '<h1>hi</h1>\n' }
    const report = await sessionFor(tempFolder(files), files).verify()
    check('ไฟล์ตรงกันหมด รายงานว่าไม่มีปัญหา', clean(report))
    check('นับไฟล์ที่ตรงครบ', report.matched === 2 && report.total === 2)
  }

  // ---- เนื้อหาต่างกัน
  {
    const root = tempFolder({ 'app.js': 'ของฉัน\n', 'ok.md': 'เหมือนกัน\n' })
    const report = await sessionFor(root, { 'app.js': 'ของ co-op\n', 'ok.md': 'เหมือนกัน\n' }).verify()
    check('จับไฟล์ที่เนื้อหาไม่ตรงได้', same(report.different, ['app.js']))
    check('ไฟล์ที่ตรงไม่ถูกนับว่าต่าง', report.matched === 1)
  }

  // ---- ลบไฟล์ทิ้ง: co-op ยังถืออยู่เพราะการลบไม่ถูก sync
  {
    const root = tempFolder({ 'keep.js': 'a\n' })
    const report = await sessionFor(root, { 'keep.js': 'a\n', 'deleted.js': 'b\n' }).verify()
    check('ไฟล์ที่มีใน co-op แต่ไม่มีบนเครื่อง ถูกแยกออกมา', same(report.missingLocal, ['deleted.js']))
  }

  // ---- ไฟล์ที่เครื่องเรามีแต่ co-op ไม่มี
  {
    const root = tempFolder({ 'shared.js': 'a\n', 'mine.js': 'b\n' })
    const report = await sessionFor(root, { 'shared.js': 'a\n' }).verify()
    check('ไฟล์ที่ยังไม่ได้แชร์ ถูกแยกออกมา', same(report.notShared, ['mine.js']))
  }

  // ---- ของที่กติกา sync ข้ามอยู่แล้ว ต้องไม่ถูกฟ้อง
  {
    const root = tempFolder({
      'app.js': 'a\n',
      '.env': 'SECRET=1\n',
      '.vscode/settings.json': '{}\n',
      'node_modules/lib/index.js': 'x\n',
      'out/bundle.js': 'y\n',
      'debug.log': 'z\n',
      'logo.png': 'not really a png\n'
    })
    const report = await sessionFor(root, { 'app.js': 'a\n' }).verify()
    check('ไฟล์ที่กติกาข้ามอยู่แล้ว ไม่ถูกรายงานว่าไม่ได้แชร์', clean(report))
  }

  // ---- ไฟล์ใหญ่เกิน 1 MB sync ไม่ได้ ต้องบอกให้รู้ ไม่ใช่เงียบ
  {
    const root = tempFolder({ 'huge.txt': 'x'.repeat(1_000_001) })
    const report = await sessionFor(root, {}).verify()
    check('ไฟล์เกิน 1 MB เข้ากอง sync ไม่ได้ ไม่ใช่กองยังไม่ได้แชร์',
      same(report.unreadable, ['huge.txt']) && same(report.notShared, []))
  }

  // ---- สิ่งที่อยู่ในจอสำคัญกว่าสิ่งที่อยู่บนดิสก์
  {
    const root = tempFolder({ 'app.js': 'ยังไม่ได้ save\n' })
    const matching = await sessionFor(root, { 'app.js': 'ของ co-op\n' }, { 'app.js': 'ของ co-op\n' }).verify()
    check('บัฟเฟอร์ที่ตรงกับ co-op นับว่าตรง แม้ไฟล์บนดิสก์ยังเก่า', matching.matched === 1 && clean(matching))

    const dirty = await sessionFor(root, { 'app.js': 'ยังไม่ได้ save\n' }, { 'app.js': 'พิมพ์เพิ่มแต่ยังไม่ save\n' }).verify()
    check('บัฟเฟอร์ที่ยังไม่ save ถูกนับว่าไม่ตรง', same(dirty.different, ['app.js']))
  }

  // ---- ลำดับผลลัพธ์คงที่ จะได้เทียบกับเพื่อนได้ตรง ๆ
  {
    const root = tempFolder({ 'c.js': '1\n', 'a.js': '1\n', 'b.js': '1\n' })
    const report = await sessionFor(root, {}).verify()
    check('รายชื่อเรียงคงที่', same(report.notShared, ['a.js', 'b.js', 'c.js']))
  }

  // ---- ดึงฉบับ co-op มาทับ
  {
    const root = tempFolder({ 'app.js': 'ของฉัน\n', 'other.js': 'อย่าแตะ\n' })
    const live = sessionFor(root, { 'app.js': 'ของ co-op\n', 'other.js': 'อย่าแตะ\n' })

    const done = await live.pull(['app.js'])
    const after = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
    check('ดึงแล้วไฟล์บนดิสก์กลายเป็นฉบับ co-op', after === 'ของ co-op\n')
    check('รายงานจำนวนไฟล์ที่ดึงถูก', done === 1)
    check('ไฟล์อื่นไม่ถูกแตะ', fs.readFileSync(path.join(root, 'other.js'), 'utf8') === 'อย่าแตะ\n')
    check('ดึงเสร็จแล้วเทียบใหม่ต้องสะอาด', clean(await live.verify()))
  }

  // ---- ดึงไฟล์ที่หายไปจากเครื่อง
  {
    const root = tempFolder({ 'keep.js': 'a\n' })
    const live = sessionFor(root, { 'keep.js': 'a\n', 'web/gone.js': 'กลับมาแล้ว\n' })

    const done = await live.pull(['web/gone.js'])
    check('ดึงไฟล์ที่หายกลับมาได้ พร้อมสร้างโฟลเดอร์ให้',
      done === 1 && fs.readFileSync(path.join(root, 'web', 'gone.js'), 'utf8') === 'กลับมาแล้ว\n')
  }

  // ---- ขอไฟล์ที่ co-op ไม่มี ต้องไม่สร้างไฟล์เปล่าทิ้งไว้
  {
    const root = tempFolder({ 'a.js': '1\n' })
    const live = sessionFor(root, { 'a.js': '1\n' })
    const done = await live.pull(['ไม่มีอยู่จริง.js'])
    check('ไฟล์ที่ co-op ไม่มี ถูกข้าม ไม่สร้างไฟล์เปล่า',
      done === 0 && !fs.existsSync(path.join(root, 'ไม่มีอยู่จริง.js')))
  }

  // ---- อะไรบ้างที่ "ทับแล้วหาย" - ตัวนี้ตัดสินว่าจะเตือนตอนเข้าห้องหรือไม่
  {
    const root = tempFolder({ 'mine.js': 'ของฉัน\n', 'diff.js': 'ของฉัน\n', 'huge.txt': 'x'.repeat(1_000_001) })
    const report = await sessionFor(root, { 'diff.js': 'ของ co-op\n', 'gone.js': 'b\n' }).verify()
    check('fixable เอาเฉพาะกองที่ทับแล้วหาย', same(fixable(report), ['diff.js', 'gone.js']))
    check('ไฟล์ของเราเองไม่ถูกนับว่าต้องซ่อม', same(report.notShared, ['mine.js']))
    check('ไฟล์ที่ sync ไม่ได้ไม่ถูกนับว่าต้องซ่อม', same(report.unreadable, ['huge.txt']))
  }

  {
    const root = tempFolder({ 'a.js': '1\n', 'b.js': 'ของฉัน\n' })
    const report = await sessionFor(root, { 'a.js': '1\n', 'b.js': 'ของฉัน\n' }).verify()
    check('โฟลเดอร์ที่ตรงอยู่แล้วไม่ต้องเตือนตอนเข้าห้อง', fixable(report).length === 0)
  }

  // ---- เปลี่ยนชื่อที่เพื่อนเห็น
  {
    const live: any = sessionFor(tempFolder({}), {})
    const sent: Array<[string, any]> = []
    live.provider = { awareness: { setLocalStateField: (field: string, value: any) => sent.push([field, value]) } }

    live.setUserName('ชื่อใหม่', '#f59e0b')
    check('เปลี่ยนชื่อแล้วกระจายออกไปทันที ไม่ต้องต่อใหม่',
      sent.length === 1 && sent[0][0] === 'user' &&
      sent[0][1].name === 'ชื่อใหม่' && sent[0][1].color === '#f59e0b')
    check('เซสชันจำชื่อใหม่ไว้ใช้ต่อ', live.userName === 'ชื่อใหม่')
  }

  const failed = results.filter(r => !r).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
