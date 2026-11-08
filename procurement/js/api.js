import { sb } from './supabase.js';

// โยน error ของ Supabase ต่อขึ้นไปเสมอ เพื่อให้ ui.errText แปลงเป็นข้อความเดียวกันทุกหน้า
const un = ({ data, error }) => { if (error) throw error; return data; };

export const rpc = (fn, args = {}) => sb.rpc(fn, args).then(un);

export const list = (table, build = (q) => q) =>
  build(sb.from(table).select('*')).then(un);

export const one = (table, id, cols = '*') =>
  sb.from(table).select(cols).eq('id', id).maybeSingle().then(un);

export const insert = (table, rows) =>
  sb.from(table).insert(rows).select().then(un);

export const update = (table, id, patch) =>
  sb.from(table).update(patch).eq('id', id).select().then(un);

export const remove = (table, id) =>
  sb.from(table).delete().eq('id', id).then(un);

export const upsert = (table, rows, onConflict) =>
  sb.from(table).upsert(rows, onConflict ? { onConflict } : undefined).select().then(un);

// ---- ข้อมูลหลักที่หลายหน้าใช้ร่วมกัน ----
export const masters = {
  costCenters: () => list('cost_centers', (q) => q.eq('active', true).order('code')),
  projects:    () => list('projects',     (q) => q.eq('active', true).order('code')),
  vendors:     () => list('vendors',      (q) => q.order('code')),
  sowClauses:  () => list('sow_clauses',  (q) => q.eq('active', true).order('seq')),
  whtRates:    () => list('wht_rates',    (q) => q.eq('active', true).order('code')),
  limits:      () => list('approval_limits', (q) => q.order('step_order')),
  company:     () => sb.from('company_profile').select('*').eq('id', 1).maybeSingle().then(un),
};

// ---- ขั้นตอนงาน (เรียก RPC เท่านั้น ห้ามเขียนสถานะตรง) ----
export const flow = {
  lockSow:        (prId) => rpc('fn_lock_sow', { p_pr: prId }),
  unlockSow:      (prId) => rpc('fn_unlock_sow', { p_pr: prId }),
  deletePr:       (prId) => rpc('fn_delete_pr', { p_pr: prId }),
  issueRfq:       (prId, vendorId, hash) =>
                    rpc('fn_issue_rfq', { p_pr: prId, p_vendor: vendorId, p_hash: hash }),
  checkBudget:    (prId, amount) => rpc('fn_check_budget', { p_pr: prId, p_amount: amount }),
  budgetForPr:    (prId) => rpc('fn_budget_for_pr', { p_pr: prId }),
  decideException:(id, approve, reason) =>
                    rpc('fn_decide_budget_exception', { p_id: id, p_approve: approve, p_reason: reason }),
  award:          (prId, awards, note) =>
                    rpc('fn_award_pr', { p_pr: prId, p_awards: awards, p_note: note ?? null }),
  submit:         (prId) => rpc('fn_submit_for_approval', { p_pr: prId }),
  decide:         (id, approve, reason) =>
                    rpc('fn_decide_approval', { p_id: id, p_approve: approve, p_reason: reason ?? null }),
  issuePo:        (prId, opts = {}) => rpc('fn_issue_po', { p_pr: prId, p_opts: opts }),
  matchInvoice:   (invId) => rpc('fn_match_invoice', { p_invoice: invId }),
  // ไฟล์บิลแนบทีหลังได้จนกว่าจะตั้งเบิก — แตะได้เฉพาะคอลัมน์ attachment_path
  // (policy keyer_update ปิดตั้งแต่จับคู่ผ่าน เพื่อกันคนแก้ "ตัวเลข" ย้อนหลัง)
  attachInvoice:  (invId, path) =>
                    rpc('fn_attach_invoice_file', { p_invoice: invId, p_path: path }),
  createVoucher:  (invId, whtCode, other = 0, note = null) =>
                    rpc('fn_create_voucher', { p_invoice: invId, p_wht_code: whtCode ?? null,
                                               p_other: other, p_other_note: note }),
  decideVoucher:  (id, approve, reason) =>
                    rpc('fn_decide_voucher', { p_id: id, p_approve: approve, p_reason: reason ?? null }),
  pay:            (voucherId, date, method, refNo, note = null) =>
                    rpc('fn_record_payment', { p_voucher: voucherId, p_paid_date: date,
                                               p_method: method, p_ref_no: refNo, p_note: note }),
  // แก้บันทึกการจ่ายที่คีย์ผิด — แตะได้แค่ 4 ช่องที่คนกรอกเอง เลขหนังสือรับรองภาษีไม่ถูกแตะ
  editPayment:    (voucherId, date, method, refNo, note = null) =>
                    rpc('fn_edit_payment', { p_voucher: voucherId, p_paid_date: date,
                                             p_method: method, p_ref_no: refNo, p_note: note }),
  confirmRetention: (poId) => rpc('fn_confirm_retention', { p_po: poId }),
  releaseRetention: (poId, ref, note = null) =>
                    rpc('fn_release_retention', { p_po: poId, p_ref: ref, p_note: note }),
  grantRole:      (userId, role) => rpc('fn_grant_role', { p_user: userId, p_role: role }),
  revokeRole:     (userId, role) => rpc('fn_revoke_role', { p_user: userId, p_role: role }),
  bootstrapAdmin: () => rpc('fn_bootstrap_admin'),
  // คืน 'deleted' (ลบทิ้งจริง) หรือ 'disabled' (มีเอกสารค้าง ลบไม่ได้ ปิดบัญชีแทน)
  removeUser:     (userId) => rpc('fn_remove_user', { p_user: userId }),
};

// ---- คำเชิญเข้าใช้งาน ----
// ผู้ใช้ใหม่ยังไม่มีตัวตนในฐานข้อมูลจนกว่าจะล็อกอิน Google ครั้งแรก
// คำเชิญคือที่พักตำแหน่งไว้ก่อน แล้วผูกให้ตอนเขาล็อกอิน
export const invites = {
  list: () => list('user_invites', (q) => q.order('created_at', { ascending: false })),

  // email = null แปลว่าเป็นลิงก์เชิญแบบเปิด ใครถือลิงก์ก็ใช้ได้
  create: ({ email = null, name = null, roles = [], maxUses = 1, days = 14, note = null }) =>
    rpc('fn_create_invite', { p_email: email, p_name: name, p_roles: roles,
                              p_max_uses: maxUses, p_days: days, p_note: note }),

  // expiresAt = null แปลว่าไม่มีวันหมดอายุ · อีเมลกับโทเคนแก้ไม่ได้ ลิงก์เดิมจึงยังใช้ได้
  update: (id, { roles = [], name = null, expiresAt = null, maxUses = 1, note = null }) =>
    rpc('fn_update_invite', { p_id: id, p_roles: roles, p_name: name,
                              p_expires_at: expiresAt, p_max_uses: maxUses, p_note: note }),

  revoke: (id) => rpc('fn_revoke_invite', { p_id: id }),

  // เรียกหลังล็อกอินสำเร็จ — ไม่มีคำเชิญที่ใช้ได้จะคืน null เฉยๆ
  claim: (token = null) => rpc('fn_claim_invite', { p_token: token }),
};

// ลิงก์ที่ส่งให้ผู้รับเชิญ — ชี้กลับมาที่หน้าเข้าสู่ระบบของชุดนี้เสมอ
export const inviteUrl = (token) => {
  const dir = location.pathname.replace(/[^/]*$/, '');
  return `${location.origin}${dir}index.html?invite=${encodeURIComponent(token)}`;
};

// hash ของใบขอราคาที่พิมพ์ออกไป — ใช้พิสูจน์ว่าฉบับที่ผู้ขายถือ ตรงกับที่ระบบเก็บ
export async function contentHash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
