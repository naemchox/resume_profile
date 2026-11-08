// An invite code carries everything a friend needs in one pasteable string:
// which server, which coop, and the token that says what they may do.

export type Role = 'owner' | 'editor' | 'viewer'

export interface Invite {
  serverUrl: string
  coopId: string
  token: string
  name: string
}

const PREFIX = 'COOP1-'

export function encodeInvite (invite: Invite): string {
  const payload = JSON.stringify({
    s: invite.serverUrl,
    r: invite.coopId,
    t: invite.token,
    n: invite.name
  })
  return PREFIX + Buffer.from(payload, 'utf8').toString('base64url')
}

export function decodeInvite (code: string): Invite | null {
  const trimmed = code.trim()
  if (!trimmed.startsWith(PREFIX)) return null
  try {
    const raw = Buffer.from(trimmed.slice(PREFIX.length), 'base64url').toString('utf8')
    const obj = JSON.parse(raw)
    if (!obj.s || !obj.r || !obj.t) return null
    return { serverUrl: obj.s, coopId: obj.r, token: obj.t, name: obj.n || 'coop' }
  } catch {
    return null
  }
}

/** ws://host -> http://host, so the same address serves both. */
export function httpBase (serverUrl: string): string {
  return serverUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/+$/, '')
}

export interface CoopInfo {
  coopId: string
  name: string
  /** What the creator's folder was called. Joiners name their copy the same. */
  folderName?: string
  role: Role
  online: number
}

/**
 * Why an invite did not work, kept apart from the message so callers can tell
 * "this room is gone for good" from "the network blinked".
 */
export class InviteError extends Error {
  constructor (message: string, readonly status: number, readonly closed = false) {
    super(message)
  }

  /** The room will never take this invite again: closed, revoked or missing. */
  get permanent (): boolean {
    return this.closed || this.status === 401 || this.status === 404 || this.status === 410
  }
}

/**
 * Checks the invite before we open a websocket, so a bad code produces a clear
 * message instead of a provider quietly retrying forever.
 */
export async function verifyInvite (invite: Invite): Promise<CoopInfo> {
  const url = `${httpBase(invite.serverUrl)}/api/coops/${encodeURIComponent(invite.coopId)}?t=${encodeURIComponent(invite.token)}`
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    throw new Error(`ต่อเซิร์ฟเวอร์ไม่ได้ (${invite.serverUrl}) - เปิดเซิร์ฟเวอร์อยู่หรือเปล่า`)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string, closed?: boolean }
    throw new InviteError(body.error || `เซิร์ฟเวอร์ตอบ ${res.status}`, res.status, body.closed === true)
  }
  return await res.json() as CoopInfo
}

export async function createCoop (
  serverUrl: string,
  name: string,
  folderName: string
): Promise<{
  coopId: string
  name: string
  folderName: string
  tokens: Record<Role, string>
}> {
  const res = await fetch(`${httpBase(serverUrl)}/api/coops`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, folderName })
  })
  if (!res.ok) throw new Error(`สร้าง co-op ไม่สำเร็จ (${res.status})`)
  return await res.json() as any
}

/** Owner only. Fetches the token for another role so we can build an invite. */
export async function fetchRoleToken (invite: Invite, role: Role): Promise<string> {
  const base = httpBase(invite.serverUrl)
  const url = `${base}/api/coops/${encodeURIComponent(invite.coopId)}/invite?t=${encodeURIComponent(invite.token)}&role=${role}`
  const res = await fetch(url)
  const body = await res.json().catch(() => ({})) as { token?: string, error?: string }
  if (!res.ok || !body.token) throw new Error(body.error || `ขอ invite ไม่สำเร็จ (${res.status})`)
  return body.token
}

/** Owner only. Invalidates the current invite for a role and issues a new one. */
export async function rotateRoleToken (invite: Invite, role: Role): Promise<string> {
  const base = httpBase(invite.serverUrl)
  const url = `${base}/api/coops/${encodeURIComponent(invite.coopId)}/rotate?t=${encodeURIComponent(invite.token)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role })
  })
  const body = await res.json().catch(() => ({})) as { token?: string, error?: string }
  if (!res.ok || !body.token) throw new Error(body.error || `ยกเลิก invite ไม่สำเร็จ (${res.status})`)
  return body.token
}

/**
 * Owner only. Shuts a co-op for good: everyone in it is disconnected and the
 * old invites answer "closed" from now on.
 *
 * Returns false when the server predates this endpoint, so the caller can say
 * the old room is still open rather than pretend it was closed.
 */
export async function closeCoop (invite: Invite): Promise<boolean> {
  const base = httpBase(invite.serverUrl)
  const url = `${base}/api/coops/${encodeURIComponent(invite.coopId)}/close?t=${encodeURIComponent(invite.token)}`
  const res = await fetch(url, { method: 'POST' })
  if (res.status === 404 || res.status === 410) {
    const body = await res.json().catch(() => ({})) as { error?: string, closed?: boolean }
    // Already closed counts as closed; "not found" from an old server does not.
    return body.closed === true
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `ปิด co-op ไม่สำเร็จ (${res.status})`)
  }
  return true
}
