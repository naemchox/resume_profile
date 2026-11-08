import type { Env, Quote, UserState } from "./types";
import { loadMeta, loadUser, saveUser } from "./state";
import { fetchQuotes } from "./yahoo";
import { getQuota, push } from "./line";
import { priceMessage } from "./flex";

/** ราคาที่ซื้อขายภายใน 90 นาทีล่าสุดถือว่าตลาดยังเปิดอยู่ (รวมดีเลย์ ~15 นาที) */
const ACTIVE_SEC = 90 * 60;

/** โควตาฟรี LINE OA ต่อเดือน และสัดส่วนที่ยอมใช้ (กันไว้ 10% เผื่อประมาณการคลาด) */
export const MONTHLY_LIMIT = 300;
const USABLE = 0.9;

/** คนที่ได้แจ้งเตือนอัตโนมัติพร้อมกันได้สูงสุด (รวมเจ้าของ) */
export const MAX_PUSH_USERS = 2;

/** รอบที่ระบบยืดให้ได้ — ทุกค่าหาร 1440 ลงตัว รอบจึงตรงเวลาเดิมทุกวัน */
const STEPS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

/** นาทีของวันตามเวลาไทย (ไทยไม่มี DST เลยบวก 7 ชม. ตรง ๆ ได้) */
export function bangkokMinuteOfDay(d: Date): number {
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 7 * 60) % 1440;
}

export function isActive(q: Quote, now: Date): boolean {
  return now.getTime() / 1000 - q.time <= ACTIVE_SEC;
}

/** ประมาณจำนวนข้อความต่อเดือน (~22 วันทำการ) */
export function estimateMonthly(symbols: string[], intervalMin: number): number {
  const thai = symbols.some((s) => s.endsWith(".BK"));
  const other = symbols.some((s) => !s.endsWith(".BK"));
  // SET ซื้อขาย 270 นาที/วัน (ตัดพักเที่ยง), ตลาดสหรัฐฯ 390 นาที/วัน
  const perDay =
    (thai ? Math.floor(270 / intervalMin) + 1 : 0) + (other ? Math.floor(390 / intervalMin) + 1 : 0);
  return perDay * 22;
}

/** ผู้ใช้คนนี้นับเป็นคนที่กำลังรับแจ้งเตือนอยู่ไหม (หารโควตาด้วย) */
export const isReceiving = (u: UserState) => !u.paused && u.watch.length > 0;

/** ส่วนแบ่งโควตาต่อคนต่อเดือน */
export function shareFor(receivingCount: number): number {
  return Math.floor((MONTHLY_LIMIT * USABLE) / Math.max(1, receivingCount));
}

/** รอบจริง = รอบที่ผู้ใช้ตั้ง หรือยืดออกจนประมาณการไม่เกินส่วนแบ่ง */
export function effectiveInterval(u: UserState, share: number): number {
  const symbols = u.watch.map((w) => w.symbol);
  const candidates = [u.intervalMin, ...STEPS.filter((s) => s > u.intervalMin)];
  return candidates.find((m) => estimateMonthly(symbols, m) <= share) ?? 1440;
}

/** ข้อมูลผู้ใช้ที่ได้แจ้งเตือนอัตโนมัติทั้งหมด + จำนวนคนที่หารโควตา */
export async function loadReceivers(env: Env) {
  const meta = await loadMeta(env);
  const users = await Promise.all(meta.users.map(async (id) => ({ id, state: await loadUser(env, id) })));
  const share = shareFor(users.filter((u) => isReceiving(u.state)).length);
  return { meta, users, share };
}

export async function runSchedule(env: Env, now: Date) {
  const { users, share } = await loadReceivers(env);
  const minute = bangkokMinuteOfDay(now);
  const due = users.filter(
    (u) => isReceiving(u.state) && minute % effectiveInterval(u.state, share) === 0,
  );
  if (!due.length) return;

  // ดึงราคาครั้งเดียวสำหรับหุ้นทุกตัวของทุกคนที่ถึงรอบ
  const symbols = [...new Set(due.flatMap((u) => u.state.watch.map((w) => w.symbol)))];
  const bySymbol = new Map((await fetchQuotes(symbols)).map((q) => [q.symbol, q]));

  let quota: Awaited<ReturnType<typeof getQuota>> | undefined;
  for (const { id, state } of due) {
    const active = state.watch
      .map((w) => bySymbol.get(w.symbol))
      .filter((q): q is Quote => !!q && isActive(q, now));
    // ส่งเฉพาะเมื่อมีราคาใหม่จริง — วันหยุด/พักเที่ยง/ตลาดปิด จะไม่มีราคาใหม่ จึงไม่เสียโควตา
    if (!active.some((q) => q.time > (state.lastSeen[q.symbol] ?? 0))) continue;

    quota ??= await getQuota(env);
    if (quota && quota.limit !== null && quota.used >= quota.limit) {
      console.log(`quota exhausted: ${quota.used}/${quota.limit}`);
      return;
    }

    if (await push(env, id, [priceMessage(active, now)])) {
      if (quota) quota.used++;
      for (const q of active) state.lastSeen[q.symbol] = q.time;
      await saveUser(env, id, state);
    }
  }
}
