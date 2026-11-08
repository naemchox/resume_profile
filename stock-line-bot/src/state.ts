import type { Env, Meta, UserState } from "./types";

const META = "meta";
/** key เดิมสมัยบอทคนเดียว — ย้ายเข้าโครงใหม่ครั้งเดียวตอนอ่าน meta ครั้งแรก */
const LEGACY = "state";

const userKey = (id: string) => `user:${id}`;

export const emptyUser = (): UserState => ({ watch: [], intervalMin: 60, paused: false, lastSeen: {} });

export async function loadMeta(env: Env): Promise<Meta> {
  const saved = await env.STATE.get<Partial<Meta>>(META, "json");
  if (saved) return { users: [], guests: [], ...saved };

  const meta: Meta = { users: [], guests: [] };
  const legacy = await env.STATE.get<UserState & { owner?: string }>(LEGACY, "json");
  if (legacy?.owner) {
    const { owner, ...user } = legacy;
    meta.owner = owner;
    meta.users = [owner];
    await saveUser(env, owner, { ...emptyUser(), ...user });
    await saveMeta(env, meta);
  }
  return meta;
}

export async function saveMeta(env: Env, meta: Meta): Promise<void> {
  await env.STATE.put(META, JSON.stringify(meta));
}

export async function loadUser(env: Env, id: string): Promise<UserState> {
  const saved = await env.STATE.get<Partial<UserState>>(userKey(id), "json");
  return { ...emptyUser(), ...saved };
}

export async function saveUser(env: Env, id: string, user: UserState): Promise<void> {
  await env.STATE.put(userKey(id), JSON.stringify(user));
}
