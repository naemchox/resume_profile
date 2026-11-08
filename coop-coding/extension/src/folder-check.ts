// Checks the folder-naming rules without VS Code. Run: npm run check:folders
import { SESSION_DIR_NAME, nextFreeFolderName, safeFolderName } from './sessionFolder'

const results: boolean[] = []
const check = (label: string, ok: boolean) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`) }

check('ชื่อปกติผ่านไปเหมือนเดิม', safeFolderName('Websites') === 'Websites')
check('ชื่อไทยใช้ได้', safeFolderName('งานเว็บ') === 'งานเว็บ')
check('ตัดอักขระที่ทำ path พัง', safeFolderName('a/b\\c:d*e?f"g<h>i|j') === 'a-b-c-d-e-f-g-h-i-j')
// สิ่งที่ต้องรับประกันคือ "ออกไปข้างนอกไม่ได้" ไม่ใช่ "ไม่มีจุดสองจุด"
const escapes = (raw: string) => {
  const out = safeFolderName(raw)
  return out.includes('/') || out.includes('\\') || out === '.' || out === '..'
}
check('ชื่อที่พยายามไต่ออกนอกโฟลเดอร์ทำไม่ได้', !escapes('../../etc'))
check('ชื่อเป็นจุดสองจุดล้วนทำไม่ได้', !escapes('..') && safeFolderName('..') === 'co-op')
check('ชื่อที่มี separator ถูกทำให้เป็นชิ้นเดียว', !escapes('a/b/../c'))
check('ตัดจุดและช่องว่างหัวท้าย', safeFolderName('  .hidden.  ') === 'hidden')
check('ยุบช่องว่างซ้ำ', safeFolderName('my    project') === 'my project')
check('ชื่อว่างได้ค่าสำรอง', safeFolderName('') === 'co-op')
check('ชื่อที่มีแต่จุดได้ค่าสำรอง', safeFolderName('...') === 'co-op')
check('ชื่อยาวมากถูกตัด', safeFolderName('x'.repeat(200)).length <= 60)
check('ชื่อโฟลเดอร์ประจำคือ "coop session"', SESSION_DIR_NAME === 'coop session')

// ---- การเลี่ยงชื่อชน
const free = (taken: string[]) => (n: string) => taken.includes(n)
check('ไม่มีใครใช้ ก็ได้ชื่อเดิม', nextFreeFolderName('startup', free([])) === 'startup')
check('ชนหนึ่งครั้งได้ (2)', nextFreeFolderName('startup', free(['startup'])) === 'startup (2)')
check('ชนสองครั้งได้ (3)', nextFreeFolderName('startup', free(['startup', 'startup (2)'])) === 'startup (3)')
check('ข้ามช่องว่างกลางไม่ได้ - เอาเลขว่างตัวแรก',
  nextFreeFolderName('startup', free(['startup', 'startup (3)'])) === 'startup (2)')
check('ชื่ออื่นที่ขึ้นต้นเหมือนกันไม่นับว่าชน',
  nextFreeFolderName('app', free(['application'])) === 'app')

const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed === 0 ? 0 : 1)
