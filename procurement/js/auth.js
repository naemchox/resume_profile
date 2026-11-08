import { sb, configured } from './supabase.js';

export let me = null;      // { id, full_name_th, full_name_en, email, roles: [...] }

export async function loadMe() {
  if (!configured) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { me = null; return null; }

  const [{ data: profile }, { data: roles }] = await Promise.all([
    sb.from('user_profiles').select('*').eq('id', session.user.id).maybeSingle(),
    sb.from('user_roles').select('role').eq('user_id', session.user.id),
  ]);

  me = profile
    ? { ...profile, roles: (roles ?? []).map((r) => r.role) }
    // ไม่มีแถวโปรไฟล์ = ยังไม่เคยตั้งผู้ดูแลคนแรก หรือถูกลบออกจากระบบไปแล้ว
    // หน้า index.html ใช้สถานะนี้เปิดปุ่มตั้งแอดมินคนแรก ส่วนหน้าอื่นต้องกันไว้
    : { id: session.user.id, email: session.user.email, full_name_th: session.user.email,
        active: true, no_profile: true, roles: [] };
  return me;
}

export const has = (r) => !!me?.roles.includes(r);
export const hasAny = (...rs) => rs.some((r) => has(r));

// เข้าระบบด้วยบัญชี Google เท่านั้น — ไม่มีรหัสผ่านให้หลุดหรือให้แชร์กัน
// เบราว์เซอร์จะถูกพาออกไปหน้า Google แล้วเด้งกลับมาที่หน้าเดิม
// supabase-js จะเก็บ session จาก URL ให้เองตอนโหลดหน้าใหม่ (detectSessionInUrl)
export async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // ตัด query/hash ทิ้ง ไม่งั้นพารามิเตอร์เก่าติดกลับมาด้วย
      redirectTo: location.origin + location.pathname,
      // บังคับให้เลือกบัญชีทุกครั้ง กันคนที่มีหลาย Gmail เข้าผิดบัญชีโดยไม่รู้ตัว
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await sb.auth.signOut();
  me = null;
  location.href = 'index.html';
}

// เรียกที่หัวทุกหน้าที่ต้องล็อกอิน — ถ้ายังไม่เข้าระบบจะเด้งกลับหน้าแรก
export async function requireAuth(...allowedRoles) {
  const u = await loadMe();
  if (!u || u.no_profile) { location.href = 'index.html'; return null; }
  if (u.active === false) { alert('บัญชีถูกปิดการใช้งาน'); await signOut(); return null; }
  if (allowedRoles.length && !hasAny(...allowedRoles, 'admin')) {
    location.href = 'home.html';
    return null;
  }
  return u;
}

// ---------------------------------------------------------------------------
// สิทธิ์เข้าหน้า — แหล่งความจริงเดียวของทั้งแอป
//
// เมนูบนแถบ (js/ui.js) กับด่านกันหน้า (requirePage ข้างล่าง) อ่านจากตารางนี้
// ตัวเดียวกัน จะได้ไม่มีวันหลุดกันเอง แบบ "เมนูไม่ขึ้นแต่พิมพ์ URL เข้าได้"
// หน้าใหม่เพิ่มที่นี่ที่เดียว แล้วได้ทั้งเมนูและด่านกันหน้าพร้อมกัน
//
//   null = ทุกคนที่มีบัญชีพนักงาน (รวมคนที่ยังไม่ได้รับตำแหน่ง)
//   admin เข้าได้ทุกหน้าโดยปริยาย ไม่ต้องใส่ในลิสต์
//
// ตารางนี้คุมแค่ "หน้าไหนเปิดได้" — ส่วน "เห็นข้อมูลแถวไหน" คุมด้วย RLS
// ที่ฐานข้อมูล (db/03_rls.sql) เช่น ผู้ขอซื้อเห็นเฉพาะใบขอซื้อของตัวเอง
// ห้ามคิดว่าซ่อนเมนูแล้วปลอดภัย — ของจริงกันที่ฐานข้อมูล ตรงนี้แค่ไม่ให้หลงเข้า
// ---------------------------------------------------------------------------
export const PAGE_ROLES = {
  'home.html':    null,
  'pr.html':      ['requester', 'purchasing'],
  'quotes.html':  ['purchasing', 'inspector'],
  'approve.html': ['inspector', 'pm', 'pd', 'ceo', 'purchasing'],
  'po.html':      ['purchasing', 'accounting', 'inspector'],
  'gr.html':      ['purchasing', 'inspector'],
  'invoice.html': ['purchasing', 'accounting'],
  'pay.html':     ['accounting', 'purchasing', 'pd', 'ceo'],
  'reports.html': ['purchasing', 'accounting', 'pm', 'pd', 'ceo'],
  'admin.html':   ['admin'],
};

export const canOpen = (page) => {
  const roles = PAGE_ROLES[page];
  return !roles || hasAny(...roles, 'admin');
};

// ด่านหัวหน้า — ใช้แทน requireAuth() ทุกหน้าที่อยู่ในตารางข้างบน
export const requirePage = (page) => requireAuth(...(PAGE_ROLES[page] ?? []));
