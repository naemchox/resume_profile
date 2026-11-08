import type { Env } from "./types";

const API = "https://api.line.me/v2/bot";

async function call(env: Env, path: string, body?: unknown): Promise<Response | null> {
  if (env.LINE_CHANNEL_ACCESS_TOKEN === "dry") {
    console.log(`[dry] ${path}`, JSON.stringify(body ?? null));
    return null;
  }
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) console.log(`LINE ${path}: HTTP ${res.status} ${await res.clone().text()}`);
  return res;
}

export async function reply(env: Env, replyToken: string, messages: unknown[]) {
  await call(env, "/message/reply", { replyToken, messages });
}

/** push นับโควตารายเดือน — คืนค่า true ถ้าส่งสำเร็จ */
export async function push(env: Env, to: string, messages: unknown[]): Promise<boolean> {
  const res = await call(env, "/message/push", { to, messages });
  return res === null || res.ok;
}

export interface QuotaInfo {
  limit: number | null; // null = ไม่จำกัด
  used: number;
}

export async function getQuota(env: Env): Promise<QuotaInfo | null> {
  if (env.LINE_CHANNEL_ACCESS_TOKEN === "dry") return { limit: 300, used: 0 };
  const [q, c] = await Promise.all([call(env, "/message/quota"), call(env, "/message/quota/consumption")]);
  if (!q?.ok || !c?.ok) return null;
  const quota: any = await q.json();
  const usage: any = await c.json();
  return { limit: quota.type === "limited" ? quota.value : null, used: usage.totalUsage ?? 0 };
}

export async function verifySignature(secret: string, body: string, signature: string | null) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

/** ชื่อที่แสดงใน LINE — ใช้ในคำสั่ง ผู้ใช้ ของเจ้าของ */
export async function getDisplayName(env: Env, userId: string): Promise<string | null> {
  const res = await call(env, `/profile/${encodeURIComponent(userId)}`);
  if (!res?.ok) return null;
  const p: any = await res.json();
  return p.displayName ?? null;
}
