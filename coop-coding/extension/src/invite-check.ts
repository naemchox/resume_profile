// Exercises the client's invite module against a running server, without
// needing VS Code. Run: npm run check:invite  (server must be up)
import {
  createCoop, decodeInvite, encodeInvite, fetchRoleToken,
  httpBase, rotateRoleToken, verifyInvite, Invite
} from './invite'

const SERVER = process.env.COOP_SERVER || 'ws://localhost:1234'

const results: Array<{ label: string, ok: boolean }> = []
function check (label: string, ok: boolean) {
  results.push({ label, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

async function main () {
  check('ws:// แปลงเป็น http:// ถูก', httpBase('ws://localhost:1234/') === 'http://localhost:1234')
  check('wss:// แปลงเป็น https:// ถูก', httpBase('wss://coop.example.com') === 'https://coop.example.com')

  const created = await createCoop(SERVER, 'invite check', 'invite-check-folder')
  const owner: Invite = {
    serverUrl: SERVER,
    coopId: created.coopId,
    token: created.tokens.owner,
    name: created.name
  }

  const code = encodeInvite(owner)
  check('invite code ขึ้นต้นด้วย COOP1-', code.startsWith('COOP1-'))
  check('invite code เป็นบรรทัดเดียว คัดลอกง่าย', !/\s/.test(code))
  console.log(`      -> ${code}`)

  const round = decodeInvite(code)
  check('decode แล้วได้ของเดิมครบ',
    !!round && round.coopId === owner.coopId && round.token === owner.token &&
    round.serverUrl === owner.serverUrl && round.name === owner.name)

  check('code มั่วถูกปฏิเสธ', decodeInvite('COOP1-ขยะ') === null)
  check('code ที่ไม่มี prefix ถูกปฏิเสธ', decodeInvite('aGVsbG8=') === null)

  const info = await verifyInvite(owner)
  check('ตรวจ invite ของ owner แล้วได้ role owner', info.role === 'owner' && info.name === 'invite check')
  check('เซิร์ฟเวอร์จำชื่อโฟลเดอร์ต้นฉบับไว้ให้คนที่ join', info.folderName === 'invite-check-folder')

  const editorToken = await fetchRoleToken(owner, 'editor')
  const editorInvite: Invite = { ...owner, token: editorToken }
  const editorInfo = await verifyInvite(editorInvite)
  check('owner ออก invite ระดับ editor ได้', editorInfo.role === 'editor')

  const viewerToken = await fetchRoleToken(owner, 'viewer')
  const viewerInfo = await verifyInvite({ ...owner, token: viewerToken })
  check('owner ออก invite ระดับ viewer ได้', viewerInfo.role === 'viewer')

  let editorBlocked = false
  try {
    await fetchRoleToken(editorInvite, 'viewer')
  } catch {
    editorBlocked = true
  }
  check('editor ออก invite ต่อไม่ได้', editorBlocked)

  const fresh = await rotateRoleToken(owner, 'editor')
  let oldDead = false
  try {
    await verifyInvite(editorInvite)
  } catch {
    oldDead = true
  }
  check('ยกเลิกแล้ว invite เดิมใช้ไม่ได้ทันที', fresh !== editorToken && oldDead)

  let badServer = false
  try {
    await verifyInvite({ ...owner, serverUrl: 'ws://localhost:59999' })
  } catch (err) {
    badServer = err instanceof Error && err.message.includes('ต่อเซิร์ฟเวอร์ไม่ได้')
  }
  check('เซิร์ฟเวอร์ล่มแล้วบอกสาเหตุชัดเจน', badServer)

  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
