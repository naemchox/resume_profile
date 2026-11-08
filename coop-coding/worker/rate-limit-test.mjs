// Abuse controls. Run against a LOCAL dev server (npm run dev) - running it
// against production would burn the real limit and litter it with co-ops.
const HTTP = process.env.HTTP || 'http://localhost:8787'

const results = []
const check = (label, ok) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`) }

const create = (caller, name = 'rl') => fetch(`${HTTP}/api/coops`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': caller },
  body: JSON.stringify({ name })
})

// ---------------------------------------------------------- create flooding

let tripped = null
let made = 0
for (let i = 0; i < 300; i++) {
  const res = await create('flooder-1')
  if (res.status === 429) { tripped = res; break }
  if (res.ok) made++
}
check('ยิงสร้าง co-op รัว ๆ แล้วโดนกั้นในที่สุด', tripped !== null)
console.log(`      -> สร้างได้ ${made} อันก่อนโดนกั้น`)

if (tripped) {
  const body = await tripped.clone().json()
  check('บอกด้วยว่าให้รออีกกี่วินาที',
    tripped.headers.get('retry-after') !== null && body.retryAfterSeconds > 0)
  check('ข้อความบอกสาเหตุเป็นภาษาคน', typeof body.error === 'string' && body.error.length > 0)
}

// ---------------------------------------------------------- buckets แยกกัน
const other = await create('innocent-bystander')
check('คนอื่นไม่โดนลูกหลง ยังสร้างได้ปกติ', other.ok)

// ---------------------------------------------------------- body ใหญ่เกิน
const huge = await fetch(`${HTTP}/api/coops`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': 'big-body' },
  body: JSON.stringify({ name: 'x'.repeat(50_000) })
})
check('ส่ง body ใหญ่เกินโดนปฏิเสธ (413)', huge.status === 413)

// ---------------------------------------------------------- เดา token รัว ๆ
const victim = await (await create('victim-owner', 'ป้อมปราการ')).json()
let authTripped = null
let guesses = 0
for (let i = 0; i < 60; i++) {
  const res = await fetch(`${HTTP}/api/coops/${victim.coopId}?t=guess-${i}`, {
    headers: { 'x-forwarded-for': 'guesser' }
  })
  if (res.status === 429) { authTripped = res; break }
  guesses++
}
check('เดา invite ผิดรัว ๆ แล้วโดนกั้น', authTripped !== null)
console.log(`      -> เดาได้ ${guesses} ครั้งก่อนโดนกั้น`)

const stillFine = await fetch(`${HTTP}/api/coops/${victim.coopId}?t=${victim.tokens.owner}`, {
  headers: { 'x-forwarded-for': 'the-real-owner' }
})
check('เจ้าของตัวจริงยังเข้าได้ ไม่โดนลูกหลงจากคนเดา', stillFine.ok)

const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed === 0 ? 0 : 1)
