// The sidebar: the room you are in, who is in it, and every room you have
// been in on this machine - so switching between rooms is one click instead of
// digging up an invite code again.
//
// One VS Code window holds one room, because a room is a whole folder. Switching
// therefore means opening that room's folder, the same way Live Share hands you
// a different workspace.

import * as path from 'path'
import * as vscode from 'vscode'
import { Role } from './invite'
import { CoopSession, CoopStatus, Peer } from './coop'

export interface RoomEntry {
  coopId: string
  name: string
  role: Role
  /** The folder on this machine that holds the room. One folder, one room. */
  folder: string
  serverUrl: string
  lastUsed: number
  /** Set when the server says the room is gone for good. */
  closed?: boolean
}

const ROOMS_KEY = 'coop.rooms'

export class RoomRegistry {
  constructor (private ctx: vscode.ExtensionContext) {}

  all (): RoomEntry[] {
    const map = this.ctx.globalState.get<Record<string, RoomEntry>>(ROOMS_KEY) ?? {}
    return Object.values(map).sort((a, b) => b.lastUsed - a.lastUsed)
  }

  byFolder (folder: string): RoomEntry | undefined {
    return this.all().find(r => r.folder === folder)
  }

  async upsert (entry: RoomEntry): Promise<void> {
    const map = { ...(this.ctx.globalState.get<Record<string, RoomEntry>>(ROOMS_KEY) ?? {}) }
    map[entry.folder] = entry
    await this.ctx.globalState.update(ROOMS_KEY, map)
  }

  async markClosed (coopId: string): Promise<void> {
    const map = { ...(this.ctx.globalState.get<Record<string, RoomEntry>>(ROOMS_KEY) ?? {}) }
    let changed = false
    for (const entry of Object.values(map)) {
      if (entry.coopId === coopId && !entry.closed) {
        entry.closed = true
        changed = true
      }
    }
    if (changed) await this.ctx.globalState.update(ROOMS_KEY, map)
  }

  async remove (folder: string): Promise<void> {
    const map = { ...(this.ctx.globalState.get<Record<string, RoomEntry>>(ROOMS_KEY) ?? {}) }
    delete map[folder]
    await this.ctx.globalState.update(ROOMS_KEY, map)
  }

  async clear (): Promise<void> {
    await this.ctx.globalState.update(ROOMS_KEY, undefined)
  }
}

// ------------------------------------------------------------ current room

type CurrentNode =
  | { kind: 'room', session: CoopSession, status: CoopStatus }
  | { kind: 'peersHeader', session: CoopSession, count: number }
  | { kind: 'peer', peer: Peer }
  | { kind: 'action', label: string, icon: string, command: string }

const ROLE_LABEL: Record<Role, string> = {
  owner: 'เจ้าของห้อง (เครื่องหลัก)',
  editor: 'แก้ไขได้',
  viewer: 'อ่านอย่างเดียว'
}

export class CurrentRoomView implements vscode.TreeDataProvider<CurrentNode> {
  private changed = new vscode.EventEmitter<CurrentNode | undefined>()
  readonly onDidChangeTreeData = this.changed.event
  private timer: NodeJS.Timeout | undefined

  constructor (
    private getSession: () => CoopSession | undefined,
    private getStatus: () => CoopStatus
  ) {}

  /** Awareness changes on every keystroke of every peer; redraw at most a few times a second. */
  refresh () {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.changed.fire(undefined)
    }, 250)
  }

  getTreeItem (node: CurrentNode): vscode.TreeItem {
    switch (node.kind) {
      case 'room': {
        const item = new vscode.TreeItem(node.session.coopName, vscode.TreeItemCollapsibleState.None)
        const status = node.status === 'online' ? 'ออนไลน์' : node.status === 'connecting' ? 'กำลังต่อ...' : 'ออฟไลน์'
        item.description = `${ROLE_LABEL[node.session.role]} · ${status}`
        item.iconPath = new vscode.ThemeIcon(
          node.status === 'online' ? 'broadcast' : 'sync~spin',
          new vscode.ThemeColor(node.status === 'online' ? 'charts.green' : 'charts.yellow')
        )
        item.tooltip = `${node.session.coopName}\n${node.session.root.fsPath}`
        item.contextValue = node.session.role === 'owner' ? 'currentRoom.owner' : 'currentRoom'
        return item
      }
      case 'peersHeader': {
        const item = new vscode.TreeItem(`ผู้เข้าร่วม (${node.count})`, vscode.TreeItemCollapsibleState.Expanded)
        item.iconPath = new vscode.ThemeIcon('organization')
        return item
      }
      case 'peer': {
        const p = node.peer
        const item = new vscode.TreeItem(p.isMe ? `${p.name} (คุณ)` : p.name)
        item.description = p.file ?? ''
        item.iconPath = new vscode.ThemeIcon(
          p.role === 'owner' ? 'star-full' : p.role === 'viewer' ? 'eye' : 'account',
          new vscode.ThemeColor('charts.' + colorName(p.color))
        )
        item.tooltip = `${p.name}${p.role ? ' · ' + ROLE_LABEL[p.role] : ''}${p.file ? '\nอยู่ที่ ' + p.file : ''}`
        if (p.isMe) {
          item.command = { command: 'coop.rename', title: 'เปลี่ยนชื่อที่เพื่อนเห็น' }
          item.contextValue = 'peer.me'
          item.tooltip += '\nคลิกเพื่อเปลี่ยนชื่อ'
        } else if (p.file) {
          item.command = { command: 'coop.followPeer', title: 'ไปดูที่เขาอยู่', arguments: [p.clientId] }
          item.contextValue = 'peer'
        }
        return item
      }
      case 'action': {
        const item = new vscode.TreeItem(node.label)
        item.iconPath = new vscode.ThemeIcon(node.icon)
        item.command = { command: node.command, title: node.label }
        return item
      }
    }
  }

  getChildren (node?: CurrentNode): CurrentNode[] {
    const session = this.getSession()
    if (!session) return [] // the welcome view takes over
    if (!node) {
      const peers = session.peers()
      const rows: CurrentNode[] = [
        { kind: 'room', session, status: this.getStatus() },
        { kind: 'peersHeader', session, count: peers.length }
      ]
      if (session.role === 'owner') {
        rows.push({ kind: 'action', label: 'คัดลอก invite ให้เพื่อน', icon: 'clippy', command: 'coop.copyInvite' })
      }
      rows.push(
        { kind: 'action', label: 'เทียบไฟล์กับ co-op', icon: 'checklist', command: 'coop.verifyFiles' },
        { kind: 'action', label: 'ออกจากห้อง', icon: 'sign-out', command: 'coop.leave' }
      )
      return rows
    }
    if (node.kind === 'peersHeader') {
      return session.peers().map(peer => ({ kind: 'peer', peer }))
    }
    return []
  }
}

// ---------------------------------------------------------------- all rooms

export interface RoomLive { online?: number, closed?: boolean, error?: string }

export class RoomListView implements vscode.TreeDataProvider<RoomEntry> {
  private changed = new vscode.EventEmitter<RoomEntry | undefined>()
  readonly onDidChangeTreeData = this.changed.event
  /** folder -> what the server said last time we asked. */
  private live = new Map<string, RoomLive>()

  constructor (
    private registry: RoomRegistry,
    private getSession: () => CoopSession | undefined,
    /** Asks the server how a room is doing. */
    private probe: (entry: RoomEntry) => Promise<RoomLive>
  ) {}

  refresh (probe = false) {
    if (probe) void this.probeAll()
    this.changed.fire(undefined)
  }

  private async probeAll () {
    await Promise.all(this.registry.all().map(async entry => {
      if (entry.closed) return
      try {
        const result = await this.probe(entry)
        this.live.set(entry.folder, result)
        if (result.closed) await this.registry.markClosed(entry.coopId)
      } catch {
        // offline: keep whatever we knew
      }
    }))
    this.changed.fire(undefined)
  }

  getTreeItem (entry: RoomEntry): vscode.TreeItem {
    const session = this.getSession()
    const current = session?.coopId === entry.coopId && session.root.fsPath === entry.folder
    const live = this.live.get(entry.folder)
    const closed = entry.closed || live?.closed

    const item = new vscode.TreeItem(entry.name)
    const parts = [entry.role === 'owner' ? 'เจ้าของ' : entry.role === 'viewer' ? 'อ่านอย่างเดียว' : 'แก้ไขได้']
    if (closed) parts.push('ปิดแล้ว')
    else if (current) parts.push('อยู่ห้องนี้')
    else if (live?.online !== undefined) parts.push(live.online > 0 ? `ออนไลน์ ${live.online} คน` : 'ไม่มีใครอยู่')
    item.description = parts.join(' · ')

    item.tooltip = new vscode.MarkdownString(
      `**${entry.name}**\n\n${entry.folder}\n\nเข้าล่าสุด ${new Date(entry.lastUsed).toLocaleString()}` +
      (closed ? '\n\n_ห้องนี้ถูกปิดแล้ว ขอ invite ใหม่จากเจ้าของ_' : '')
    )
    item.iconPath = new vscode.ThemeIcon(
      closed ? 'circle-slash' : current ? 'broadcast' : entry.role === 'owner' ? 'star-empty' : 'folder',
      current ? new vscode.ThemeColor('charts.green') : undefined
    )
    item.contextValue = closed ? 'room.closed' : current ? 'room.current' : 'room'
    if (!closed && !current) {
      item.command = { command: 'coop.switchRoom', title: 'เปลี่ยนไปห้องนี้', arguments: [entry] }
    }
    return item
  }

  getChildren (entry?: RoomEntry): RoomEntry[] {
    if (entry) return []
    return this.registry.all()
  }
}

/** The theme colour closest to a cursor colour, so the sidebar icon matches the cursor. */
function colorName (hex: string): string {
  const map: Record<string, string> = {
    '#f59e0b': 'orange', '#22c55e': 'green', '#3b82f6': 'blue', '#ec4899': 'red',
    '#a855f7': 'purple', '#ef4444': 'red', '#14b8a6': 'green', '#eab308': 'yellow'
  }
  return map[hex.toLowerCase()] ?? 'foreground'
}

export function folderLabel (folder: string): string {
  return path.basename(folder)
}
