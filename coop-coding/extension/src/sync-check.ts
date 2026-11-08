// Two real sessions - a host and a guest - talking through a real server.
// Checks the rules that keep the folders in step:
//   host's disk is the truth, co-op edits reach disk only on save,
//   clashing edits are asked about, deletes travel, closed rooms say so.
//
// Run with a server up:   cd ../worker && npm run dev
// Then:                   COOP_SERVER=ws://localhost:8787 npm run check:sync
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { closeCoop, createCoop, Invite } from './invite'
import { Conflict, CoopSession, HostDrift } from './coop'

const SERVER = process.env.COOP_SERVER || 'ws://localhost:8787'
const events = (vscode as any).events

const results: boolean[] = []
const check = (label: string, ok: boolean) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
async function until (fn: () => boolean, ms = 4000): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await wait(50)
  }
  return fn()
}

function folder (files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-sync-'))
  for (const [key, text] of Object.entries(files)) write(root, key, text)
  return root
}
const write = (root: string, key: string, text: string) => {
  const target = path.join(root, ...key.split('/'))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
}
const read = (root: string, key: string): string | null => {
  try { return fs.readFileSync(path.join(root, ...key.split('/')), 'utf8') } catch { return null }
}

interface Hooked {
  session: CoopSession
  ready: Promise<void>
  conflicts: Conflict[]
  drift: HostDrift[]
  closed: string[]
}

function join (root: string, invite: Invite, role: 'owner' | 'editor', userName: string): Hooked {
  const out: Partial<Hooked> = { conflicts: [], drift: [], closed: [] }
  let markReady: () => void = () => {}
  out.ready = new Promise(r => { markReady = r })
  out.session = new CoopSession(
    vscode.Uri.file(root),
    {
      serverUrl: invite.serverUrl,
      coopId: invite.coopId,
      coopName: invite.name,
      token: invite.token,
      role,
      userName,
      color: '#3b82f6'
    },
    {
      onStatus: () => {},
      onReady: () => markReady(),
      onConflict: c => out.conflicts!.push(c),
      onHostDrift: d => out.drift!.push(d),
      onClosed: reason => out.closed!.push(reason)
    }
  )
  return out as Hooked
}

/** What the host's file watcher would report. */
function watcherSees (kind: 'onDidChange' | 'onDidCreate' | 'onDidDelete', root: string, key: string) {
  for (const w of events.watchers) {
    if (w.root === root) w[kind].fire(vscode.Uri.file(path.join(root, ...key.split('/'))))
  }
}

/** A person pressing save on a file with this text in the buffer. */
function userSaves (root: string, key: string, text: string) {
  write(root, key, text)
  events.save.fire({ uri: vscode.Uri.file(path.join(root, ...key.split('/'))), getText: () => text, isDirty: false })
}

/** Typing in the co-op without saving: goes straight into the shared text. */
function typeInCoop (s: CoopSession, key: string, text: string) {
  const ytext = (s as any).files.get(key)
  ;(s as any).doc.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, text) }, 'local-editor')
}

async function main () {
  const created = await createCoop(SERVER, 'sync check', 'sync-check')
  const owner: Invite = { serverUrl: SERVER, coopId: created.coopId, token: created.tokens.owner, name: created.name }
  const editor: Invite = { ...owner, token: created.tokens.editor }

  const hostRoot = folder({ 'index.html': '<h1>v1</h1>\n', 'css/site.css': 'body{}\n', 'old.js': 'x\n' })
  const guestRoot = folder({})

  const host = join(hostRoot, owner, 'owner', 'host')
  await host.ready
  const guest = join(guestRoot, editor, 'editor', 'guest')
  await guest.ready

  // ---- เข้าห้องครั้งแรก
  check('เพื่อนได้ไฟล์ของเจ้าของครบตอนเข้าห้อง',
    await until(() => read(guestRoot, 'index.html') === '<h1>v1</h1>\n' && read(guestRoot, 'css/site.css') === 'body{}\n'))
  check('ห้องใหม่ เจ้าของไม่ถูกถามเรื่องไฟล์ไม่ตรง', host.drift.length === 0)

  // ---- เจ้าของแก้ไฟล์นอก co-op
  write(hostRoot, 'index.html', '<h1>v2 from outside</h1>\n')
  watcherSees('onDidChange', hostRoot, 'index.html')
  check('เจ้าของแก้นอก co-op → ไฟล์ของเพื่อนเปลี่ยนตามเอง',
    await until(() => read(guestRoot, 'index.html') === '<h1>v2 from outside</h1>\n'))

  write(hostRoot, 'new.md', '# new\n')
  watcherSees('onDidCreate', hostRoot, 'new.md')
  check('เจ้าของสร้างไฟล์ใหม่นอก co-op → เพื่อนได้ไฟล์ด้วย',
    await until(() => read(guestRoot, 'new.md') === '# new\n'))

  // ---- พิมพ์ในห้อง ยังไม่เซฟ
  typeInCoop(guest.session, 'css/site.css', 'body{color:red}\n')
  await wait(800)
  check('เพื่อนพิมพ์แต่ยังไม่เซฟ → ไฟล์บนเครื่องเจ้าของยังไม่เปลี่ยน', read(hostRoot, 'css/site.css') === 'body{}\n')
  check('...แต่ข้อความในห้องเปลี่ยนแล้ว', host.session.sharedText('css/site.css') === 'body{color:red}\n')

  // ---- เพื่อนกดเซฟ
  userSaves(guestRoot, 'css/site.css', 'body{color:red}\n')
  check('เพื่อนกดเซฟ → ไฟล์บนเครื่องเจ้าของเปลี่ยนตาม',
    await until(() => read(hostRoot, 'css/site.css') === 'body{color:red}\n'))
  // The host's watcher fires for our own write; it must not bounce back.
  watcherSees('onDidChange', hostRoot, 'css/site.css')
  await wait(600)
  check('การเขียนของเราเองไม่ถูกนับเป็นการแก้นอก co-op', host.conflicts.length === 0)

  // ---- ชนกัน: เพื่อนมีงานค้าง + เจ้าของแก้ข้างนอก
  typeInCoop(guest.session, 'index.html', '<h1>guest unsaved</h1>\n')
  await until(() => host.session.sharedText('index.html') === '<h1>guest unsaved</h1>\n')
  write(hostRoot, 'index.html', '<h1>host outside again</h1>\n')
  watcherSees('onDidChange', hostRoot, 'index.html')
  check('ชนกัน → เพื่อนถูกเตือน', await until(() => guest.conflicts.length === 1))
  check('ชนกัน → เจ้าของถูกเตือนด้วย', host.conflicts.length === 1)
  check('ระหว่างรอคำตอบ งานที่ยังไม่เซฟของเพื่อนยังอยู่', host.session.sharedText('index.html') === '<h1>guest unsaved</h1>\n')

  const c1 = guest.conflicts[0]
  check('เพื่อนเลือก "ใช้ของเครื่องเจ้าของ" ได้', guest.session.resolveConflict(c1.key, c1.id, 'host'))
  await until(() => !host.session.conflictFor(c1.key))
  check('คนที่สองตอบช้าไป ถูกปฏิเสธ', !host.session.resolveConflict(c1.key, c1.id, 'coop'))
  check('...ห้องได้ของเจ้าของ',
    await until(() => guest.session.sharedText('index.html') === '<h1>host outside again</h1>\n'))
  check('...ไฟล์ของเพื่อนก็เป็นของเจ้าของ',
    await until(() => read(guestRoot, 'index.html') === '<h1>host outside again</h1>\n'))

  // the other answer
  typeInCoop(guest.session, 'index.html', '<h1>keep me</h1>\n')
  await until(() => host.session.sharedText('index.html') === '<h1>keep me</h1>\n')
  write(hostRoot, 'index.html', '<h1>host third</h1>\n')
  watcherSees('onDidChange', hostRoot, 'index.html')
  await until(() => guest.conflicts.length === 2)
  const c2 = guest.conflicts[1]
  check('เลือก "เก็บงานในห้อง" ได้', !!c2 && guest.session.resolveConflict(c2.key, c2.id, 'coop'))
  check('...งานในห้องถูกเซฟทับไฟล์ของเจ้าของ',
    await until(() => read(hostRoot, 'index.html') === '<h1>keep me</h1>\n'))

  // ---- ลบ / เปลี่ยนชื่อ
  fs.rmSync(path.join(hostRoot, 'old.js'))
  watcherSees('onDidDelete', hostRoot, 'old.js')
  check('เจ้าของลบไฟล์นอก co-op → ไฟล์ของเพื่อนหายด้วย', await until(() => read(guestRoot, 'old.js') === null))

  fs.renameSync(path.join(guestRoot, 'new.md'), path.join(guestRoot, 'renamed.md'))
  events.rename.fire({ files: [{
    oldUri: vscode.Uri.file(path.join(guestRoot, 'new.md')),
    newUri: vscode.Uri.file(path.join(guestRoot, 'renamed.md'))
  }] })
  check('เพื่อนเปลี่ยนชื่อไฟล์ใน VS Code → เครื่องเจ้าของเปลี่ยนตาม',
    await until(() => read(hostRoot, 'renamed.md') === '# new\n' && read(hostRoot, 'new.md') === null))

  fs.rmSync(path.join(guestRoot, 'css'), { recursive: true })
  events.delete.fire({ files: [vscode.Uri.file(path.join(guestRoot, 'css'))] })
  check('เพื่อนลบทั้งโฟลเดอร์ใน VS Code → เครื่องเจ้าของลบตาม',
    await until(() => read(hostRoot, 'css/site.css') === null))

  // ---- เพื่อนแก้ไฟล์ตัวเองนอก co-op: ไม่สนใจ
  write(guestRoot, 'renamed.md', 'guest scribble\n')
  await wait(800)
  check('เพื่อนแก้ไฟล์นอก co-op → ไม่ไปถึงห้อง', host.session.sharedText('renamed.md') === '# new\n')

  // ---- เจ้าของกลับเข้าห้องหลังแก้ไฟล์ระหว่างไม่อยู่
  host.session.dispose()
  guest.session.dispose()
  await wait(500)
  write(hostRoot, 'renamed.md', 'edited while away\n')
  const back = join(hostRoot, owner, 'owner', 'host')
  await back.ready
  check('เจ้าของกลับเข้าห้อง → ถูกถามเรื่องไฟล์ที่ไม่ตรง',
    back.drift.length === 1 && back.drift[0].different.includes('renamed.md'))
  await back.session.adoptHostDisk(back.drift[0].different)
  check('"ใช้ของเครื่องฉัน" → ห้องได้ของเครื่องเจ้าของ', back.session.sharedText('renamed.md') === 'edited while away\n')

  // ---- ปิดห้อง: invite เก่าบอกชัด ๆ
  const guest2 = join(guestRoot, editor, 'editor', 'guest')
  await guest2.ready
  check('ปิดห้องเดิมได้', await closeCoop(owner))
  check('คนที่อยู่ในห้องที่ถูกปิด ได้ข้อความว่าห้องถูกปิด',
    await until(() => guest2.closed.length > 0 && /ปิด/.test(guest2.closed[0])))
  back.session.dispose()
  guest2.session.dispose()
}

main()
  .catch(err => { console.error(err); results.push(false) })
  .finally(() => {
    const passed = results.filter(Boolean).length
    console.log(`\n${passed}/${results.length} passed`)
    process.exit(passed === results.length ? 0 : 1)
  })
