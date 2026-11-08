import * as vscode from 'vscode'
import * as Y from 'yjs'
import * as WS from 'ws'
import { WebsocketProvider } from 'y-websocket'
import { Presence, RemoteCursor, RemoteUser, colorFor } from './presence'
import { Role, verifyInvite, InviteError } from './invite'
import {
  isDirectory, keyToUri, readText, relKey, relPath, removeFile, scanFiles, writeText
} from './workspaceFiles'

// `ws` exports its class both as module.exports and as module.exports.WebSocket.
// A namespace import hands us the module object, which y-websocket would try to
// `new` - so pick the constructor out of it here.
const WebSocketImpl: any = (WS as any).WebSocket ?? (WS as any).default ?? WS

// Marks a transaction as "this came from our own editor", so the observer does
// not turn around and write it straight back into the editor.
const LOCAL = 'local-editor'

/** Close codes the server uses when a seat is gone for good. */
const CLOSE_REVOKED = 4401
const CLOSE_CLOSED = 4410

export interface CoopOptions {
  serverUrl: string
  coopId: string
  coopName: string
  /** Proves what we are allowed to do. The server checks it, not us. */
  token: string
  role: Role
  userName: string
  color: string
}

export type CoopStatus = 'connecting' | 'online' | 'offline'

export interface Peer {
  clientId: number
  name: string
  color: string
  role?: Role
  /** The file their cursor is in, if any. */
  file?: string
  isMe: boolean
}

/** The host's disk and the co-op disagreed when the host walked in. */
export interface HostDrift {
  /** On the host's disk and in the co-op, with different text. */
  different: string[]
  /** In the co-op, gone from the host's disk. */
  missing: string[]
}

/** The host changed a file outside the co-op while someone had unsaved work in it. */
export interface Conflict {
  id: string
  key: string
  /** What is on the host's disk now. */
  text: string
  by: string
  at: number
}

export interface SessionHooks {
  onStatus: (status: CoopStatus, peers: number) => void
  /** Fires once the folder and the co-op have finished meeting each other. */
  onReady?: () => void
  onPeers?: () => void
  /** Host only. */
  onHostDrift?: (drift: HostDrift) => void
  onConflict?: (conflict: Conflict) => void
  /** The server will never take this seat again. The session is already dead. */
  onClosed?: (reason: string) => void
}

/**
 * What a folder looks like next to the co-op it belongs to.
 *
 * The shared doc is the one thing both sides provably agree on, so each person
 * comparing their own disk against it is the same as comparing with each other
 * - and nobody has to run anything on the other machine.
 */
export interface VerifyReport {
  /** Files the co-op is carrying. */
  total: number
  matched: number
  /** In the co-op and on disk, but the text differs. */
  different: string[]
  /** In the co-op, nothing on disk. */
  missingLocal: string[]
  /** On disk but never shared - skipped by the sync rules, or added while
   *  connected read-only. */
  notShared: string[]
  /** On disk, but too big or too binary for the co-op to carry. */
  unreadable: string[]
}

/**
 * The part of a report that overwriting from the co-op can actually fix.
 *
 * Left out on purpose: files that are only on this machine, and files too big
 * or too binary to sync. Both are ordinary - every folder has some - so
 * treating them as problems would mean a warning on every single join.
 */
export function fixable (report: VerifyReport): string[] {
  return [...report.different, ...report.missingLocal]
}

interface SaveMark { n: number, by: string, at: number }

/**
 * How the folders stay in step:
 *
 *   - The owner is the host. Their folder on disk is the source of truth.
 *     Anything that changes it - another editor, git, Finder - is pushed into
 *     the co-op by a file watcher, and everyone's disk follows.
 *   - Typing inside the co-op is live for everyone's editor, but reaches
 *     anyone's disk only when somebody presses save. A save is broadcast as a
 *     "save mark", and every machine then writes that file.
 *   - If the host changes a file outside while someone has unsaved co-op work
 *     in it, nothing is overwritten: a conflict is published and whoever
 *     answers first decides.
 *   - Guests' disks are mirrors. What they change outside the co-op is ignored
 *     and put back.
 */
export class CoopSession {
  private doc = new Y.Doc()
  private files: Y.Map<Y.Text>
  private saves: Y.Map<SaveMark>
  private conflicts: Y.Map<Conflict>
  private provider: WebsocketProvider
  private presence: Presence
  private disposables: vscode.Disposable[] = []
  private observed = new WeakSet<Y.Text>()

  /** > 0 while we are writing remote changes into an editor. */
  private applyingRemote = 0
  /** Files we are saving ourselves, so the save event is not taken as the user's. */
  private selfSaves = new Set<string>()
  /** Remote writes run one at a time so they never race each other. */
  private chain: Promise<void> = Promise.resolve()
  private pending = new Map<string, NodeJS.Timeout>()
  private hostChecks = new Map<string, NodeJS.Timeout>()
  private ready = false
  private dead = false
  private warnedReadOnly = false
  private failedConnects = 0
  private lastRescan = 0

  /**
   * Host only: what the host's disk held the last time it and the co-op
   * agreed. Text in the co-op that differs from this is unsaved work.
   */
  private disk = new Map<string, string>()

  get role (): Role { return this.opts.role }
  get coopName (): string { return this.opts.coopName }
  get coopId (): string { return this.opts.coopId }
  get isHost (): boolean { return this.opts.role === 'owner' }
  private get canWrite (): boolean { return this.opts.role !== 'viewer' }

  constructor (
    public readonly root: vscode.Uri,
    private readonly opts: CoopOptions,
    private readonly hooks: SessionHooks
  ) {
    this.files = this.doc.getMap('files')
    this.saves = this.doc.getMap('saves')
    this.conflicts = this.doc.getMap('conflicts')
    this.presence = new Presence(root)

    this.provider = new WebsocketProvider(opts.serverUrl, opts.coopId, this.doc, {
      WebSocketPolyfill: WebSocketImpl,
      disableBc: true,
      params: { t: opts.token }
    } as any)

    this.provider.on('status', (e: { status: string }) => {
      if (e.status === 'connected') this.failedConnects = 0
      this.hooks.onStatus(e.status === 'connected' ? 'online' : 'connecting', this.peerCount())
    })
    this.provider.on('connection-close', (event: any) => this.onConnectionClose(event))

    // 'sync' fires once the server has told us everything it knows. Only then
    // is it safe to decide what to upload and what to pull down.
    this.provider.on('sync', (isSynced: boolean) => {
      if (isSynced && !this.ready) {
        this.ready = true
        this.enqueue(() => this.bootstrap())
      }
    })

    const awareness = this.provider.awareness
    awareness.setLocalStateField('user', { name: opts.userName, color: opts.color, role: opts.role })
    awareness.on('change', () => {
      this.renderPresence()
      this.hooks.onStatus('online', this.peerCount())
      this.hooks.onPeers?.()
    })

    this.wireEditorEvents()
  }

  // ---------------------------------------------------------------- lifecycle

  private enqueue (fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(() => this.dead ? undefined : fn()).catch(err => console.error('[coop]', err))
    return this.chain
  }

  private peerCount (): number {
    return this.provider.awareness.getStates().size
  }

  /**
   * A websocket that keeps closing is either a bad network or a seat that no
   * longer exists. The server says which over http, so after a few failures we
   * ask instead of retrying forever into a room that is gone.
   */
  private onConnectionClose (event: any) {
    if (this.dead) return
    const code = event?.code
    if (code === CLOSE_CLOSED) return this.die('เจ้าของปิด co-op นี้แล้ว (สร้างห้องใหม่แทน) - ขอ invite ใหม่จากเจ้าของ')
    if (code === CLOSE_REVOKED) return this.die('invite ที่ใช้เข้าห้องนี้ถูกยกเลิกแล้ว - ขอ invite ใหม่จากเจ้าของ')

    this.failedConnects++
    if (this.failedConnects !== 3) return
    verifyInvite({
      serverUrl: this.opts.serverUrl,
      coopId: this.opts.coopId,
      token: this.opts.token,
      name: this.opts.coopName
    }).catch(err => {
      if (err instanceof InviteError && err.permanent) this.die(err.message)
    })
  }

  private die (reason: string) {
    if (this.dead) return
    this.hooks.onClosed?.(reason)
  }

  /**
   * First contact with the co-op. The host and the guests meet it differently:
   * the host's disk is the truth, a guest's disk is a copy.
   */
  private async bootstrap (): Promise<void> {
    this.files.observe(event => {
      if (event.transaction.origin === LOCAL) return
      for (const [key, change] of event.changes.keys) {
        if (change.action === 'delete') {
          this.enqueue(() => this.removeLocal(key))
        } else {
          this.watch(key)
          this.enqueue(() => this.remoteAdded(key))
        }
      }
    })

    // Every save mark, ours included: writing is a no-op when disk already matches.
    this.saves.observe(event => {
      for (const [key, change] of event.changes.keys) {
        if (change.action !== 'delete') this.enqueue(() => this.writeSaved(key))
      }
    })

    this.conflicts.observe(event => {
      for (const [key, change] of event.changes.keys) {
        if (change.action === 'delete') continue
        const conflict = this.conflicts.get(key)
        if (conflict && this.canWrite) this.hooks.onConflict?.(conflict)
      }
    })

    if (this.isHost) await this.bootstrapHost()
    else await this.bootstrapGuest()

    for (const conflict of this.conflicts.values()) {
      if (this.canWrite) this.hooks.onConflict?.(conflict)
    }

    this.wireFileEvents()

    vscode.window.setStatusBarMessage(
      `$(check) Co-op "${this.opts.coopName}": ${this.files.size} ไฟล์`,
      4000
    )
    this.hooks.onReady?.()
  }

  private async bootstrapHost (): Promise<void> {
    const localFiles = await scanFiles(this.root)
    const uploads: Array<[string, string]> = []
    const different: string[] = []

    for (const key of localFiles) {
      const text = await readText(this.root, key)
      if (text === null) continue
      this.disk.set(key, text)
      const shared = this.files.get(key)
      if (!shared) uploads.push([key, text])
      else if (shared.toString() !== text) different.push(key)
    }

    const missing = Array.from(this.files.keys()).filter(key => !this.disk.has(key))

    if (uploads.length > 0) {
      this.doc.transact(() => {
        for (const [key, text] of uploads) this.files.set(key, textOf(text))
      }, LOCAL)
    }

    for (const key of Array.from(this.files.keys())) this.watch(key)

    // Open buffers show the co-op's live text, unsaved work included.
    for (const key of Array.from(this.files.keys())) {
      if (this.openDoc(key)) await this.pullToLocal(key)
    }

    if (different.length + missing.length > 0) {
      this.hooks.onHostDrift?.({ different: different.sort(), missing: missing.sort() })
    }
  }

  /**
   * A guest's folder is made to look like the co-op. Files only the guest has
   * are left alone but not uploaded: they are most likely files the co-op
   * deleted while the guest was away, and uploading them would bring them back.
   */
  private async bootstrapGuest (): Promise<void> {
    for (const key of Array.from(this.files.keys())) {
      this.watch(key)
      await this.writeSaved(key)
    }
  }

  private watch (key: string) {
    const ytext = this.files.get(key)
    if (!ytext || this.observed.has(ytext)) return
    this.observed.add(ytext)
    ytext.observe(event => {
      if (event.transaction.origin === LOCAL) return
      this.schedulePull(key)
    })
  }

  // ------------------------------------------------------- remote -> my disk

  private schedulePull (key: string) {
    const existing = this.pending.get(key)
    if (existing) clearTimeout(existing)
    // Coalesce a burst of keystrokes from the other side into one edit.
    this.pending.set(key, setTimeout(() => {
      this.pending.delete(key)
      this.enqueue(() => this.pullToLocal(key))
    }, 15))
  }

  private openDoc (key: string): vscode.TextDocument | undefined {
    const fsPath = keyToUri(this.root, key).fsPath
    return vscode.workspace.textDocuments.find(
      d => d.uri.scheme === 'file' && d.uri.fsPath === fsPath && !d.isClosed
    )
  }

  /**
   * Makes an open editor show the co-op's live text. Does not touch the disk:
   * that waits for somebody to save.
   *
   * Instead of replaying the CRDT delta (whose offsets go stale the moment
   * anything else touches the buffer) we diff the editor's *current* text
   * against the target and write the one range that differs.
   */
  private async pullToLocal (key: string): Promise<void> {
    const ytext = this.files.get(key)
    const open = this.openDoc(key)
    if (!ytext || !open) return
    await this.applyToBuffer(open, ytext.toString())
  }

  private async applyToBuffer (open: vscode.TextDocument, target: string): Promise<void> {
    const current = open.getText()
    if (current === target) return
    const { start, endCur, endTar } = diffRange(current, target)

    const edit = new vscode.WorkspaceEdit()
    edit.replace(
      open.uri,
      new vscode.Range(open.positionAt(start), open.positionAt(endCur)),
      target.slice(start, endTar)
    )

    this.applyingRemote++
    try {
      await vscode.workspace.applyEdit(edit)
    } finally {
      this.applyingRemote--
    }
  }

  /**
   * Somebody saved this file: put the co-op's text on this machine's disk.
   * Open buffers are updated and saved, so dev servers and watchers see it.
   */
  private async writeSaved (key: string): Promise<void> {
    const ytext = this.files.get(key)
    if (!ytext) return
    const target = ytext.toString()
    if (this.isHost) this.disk.set(key, target)

    const open = this.openDoc(key)
    if (open) {
      await this.applyToBuffer(open, target)
      if (open.isDirty && open.getText() === target) await this.saveQuietly(open)
      return
    }
    const onDisk = await readText(this.root, key)
    if (onDisk !== target) await writeText(this.root, key, target)
  }

  private async saveQuietly (doc: vscode.TextDocument) {
    const fsPath = doc.uri.fsPath
    this.selfSaves.add(fsPath)
    setTimeout(() => this.selfSaves.delete(fsPath), 3000)
    this.applyingRemote++
    try {
      await doc.save()
    } catch {
      // a failed save is not worth interrupting anyone over
    } finally {
      this.applyingRemote--
    }
  }

  /** A file appeared in the co-op from somewhere else. */
  private async remoteAdded (key: string): Promise<void> {
    if (this.isHost && !this.disk.has(key)) {
      // The host already has a file by that name that the co-op never saw:
      // the host's disk wins, as always.
      const mine = await readText(this.root, key)
      const ytext = this.files.get(key)
      if (mine !== null && ytext && ytext.toString() !== mine) {
        this.disk.set(key, mine)
        this.doc.transact(() => { replaceText(ytext, mine); this.markSaved(key) }, LOCAL)
        return
      }
    }
    await this.writeSaved(key)
  }

  private async removeLocal (key: string): Promise<void> {
    this.disk.delete(key)
    if (!await exists(keyToUri(this.root, key))) return
    await removeFile(this.root, key)
  }

  // ------------------------------------------------------- my editor -> coop

  private wireEditorEvents () {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => this.onLocalEdit(e)),
      vscode.workspace.onDidSaveTextDocument(doc => this.onLocalSave(doc)),
      vscode.workspace.onDidOpenTextDocument(doc => {
        // Opening a file shows what the co-op has, unsaved work included.
        const key = relKey(this.root, doc.uri)
        if (this.ready && key && this.files.has(key)) this.schedulePull(key)
      }),
      vscode.window.onDidChangeTextEditorSelection(e => this.publishCursor(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) this.publishCursor(editor)
        this.renderPresence()
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.renderPresence())
    )
  }

  /** Deletes, renames and new files - from VS Code for everyone, from anywhere for the host. */
  private wireFileEvents () {
    this.disposables.push(
      vscode.workspace.onDidCreateFiles(e => {
        if (!this.guardWrite()) return
        for (const uri of e.files) this.enqueue(() => this.addFromDisk(uri))
      }),
      vscode.workspace.onDidDeleteFiles(e => {
        if (!this.guardWrite()) return
        for (const uri of e.files) this.dropKeysUnder(uri)
      }),
      vscode.workspace.onDidRenameFiles(e => {
        if (!this.guardWrite()) return
        for (const { oldUri, newUri } of e.files) this.moveKeys(oldUri, newUri)
      })
    )

    if (!this.isHost) return

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.root, '**/*')
    )
    watcher.onDidCreate(uri => this.scheduleHostCheck(uri))
    watcher.onDidChange(uri => this.scheduleHostCheck(uri))
    watcher.onDidDelete(uri => this.scheduleHostCheck(uri))
    this.disposables.push(
      watcher,
      // Watchers miss things on synced drives (Google Drive, iCloud). Coming
      // back to the window is a cheap moment to look again.
      vscode.window.onDidChangeWindowState(state => {
        if (state.focused) this.enqueue(() => this.hostRescan())
      })
    )
  }

  private guardWrite (): boolean {
    if (!this.ready) return false
    if (!this.canWrite) {
      this.nagReadOnly()
      return false
    }
    return true
  }

  private onLocalEdit (e: vscode.TextDocumentChangeEvent) {
    if (!this.ready || this.applyingRemote > 0) return
    const key = relKey(this.root, e.document.uri)
    if (!key) return
    if (e.contentChanges.length === 0) return

    // A clean buffer that changed without undo/redo is VS Code reloading the
    // file because it changed on disk - an edit from outside the co-op.
    if (!e.document.isDirty && e.reason === undefined && this.files.has(key)) {
      if (this.isHost) {
        const text = e.document.getText()
        this.enqueue(() => this.hostChanged(key, text))
      } else {
        this.schedulePull(key)
      }
      return
    }

    if (!this.canWrite) {
      this.nagReadOnly()
      return
    }

    const ytext = this.files.get(key)
    if (!ytext) {
      this.trackNewFile(e.document)
      return
    }

    // Back to front, so each offset still refers to the text we are editing.
    const changes = [...e.contentChanges].sort((a, b) => b.rangeOffset - a.rangeOffset)

    this.doc.transact(() => {
      for (const change of changes) {
        if (change.rangeLength > 0) ytext.delete(change.rangeOffset, change.rangeLength)
        if (change.text.length > 0) ytext.insert(change.rangeOffset, change.text)
      }
    }, LOCAL)

    // Cheap insurance: if the two ever disagree, the editor wins and we resync
    // the shared copy rather than letting the drift compound.
    const after = e.document.getText()
    if (ytext.toString() !== after) {
      this.doc.transact(() => replaceText(ytext, after), LOCAL)
    }
  }

  /** Pressing save is what moves the co-op onto everyone's disk. */
  private onLocalSave (doc: vscode.TextDocument) {
    if (this.selfSaves.delete(doc.uri.fsPath)) return
    if (!this.ready || this.applyingRemote > 0 || !this.canWrite) return
    const key = relKey(this.root, doc.uri)
    if (!key) return

    const ytext = this.files.get(key)
    if (!ytext) {
      this.trackNewFile(doc)
      return
    }
    const text = doc.getText()
    if (this.isHost) this.disk.set(key, text)
    this.doc.transact(() => {
      replaceText(ytext, text)
      this.markSaved(key)
    }, LOCAL)
  }

  /** Must run inside a transaction alongside the text it is marking. */
  private markSaved (key: string) {
    const prev = this.saves.get(key)?.n ?? 0
    this.saves.set(key, { n: prev + 1, by: this.opts.userName, at: Date.now() })
  }

  private trackNewFile (doc: vscode.TextDocument) {
    if (!this.ready || !this.canWrite) return
    const key = relKey(this.root, doc.uri)
    if (!key || this.files.has(key)) return
    const text = doc.getText()
    if (this.isHost && !doc.isDirty) this.disk.set(key, text)
    this.doc.transact(() => this.files.set(key, textOf(text)), LOCAL)
    this.watch(key)
  }

  private async addFromDisk (uri: vscode.Uri): Promise<void> {
    const keys = await isDirectory(uri)
      ? await scanFiles(this.root, relPath(this.root, uri) ?? '')
      : [relKey(this.root, uri)].filter((k): k is string => !!k)
    for (const key of keys) {
      if (this.files.has(key)) continue
      const text = await readText(this.root, key)
      if (text === null) continue
      if (this.isHost) this.disk.set(key, text)
      this.doc.transact(() => this.files.set(key, textOf(text)), LOCAL)
      this.watch(key)
    }
  }

  private keysUnder (uri: vscode.Uri): string[] {
    const rel = relPath(this.root, uri)
    if (!rel) return []
    return Array.from(this.files.keys()).filter(k => k === rel || k.startsWith(rel + '/'))
  }

  private dropKeysUnder (uri: vscode.Uri) {
    const keys = this.keysUnder(uri)
    if (keys.length === 0) return
    this.doc.transact(() => {
      for (const key of keys) {
        this.files.delete(key)
        this.saves.delete(key)
        this.conflicts.delete(key)
        this.disk.delete(key)
      }
    }, LOCAL)
  }

  /** A rename is a delete plus an add that keeps the text, unsaved work included. */
  private moveKeys (oldUri: vscode.Uri, newUri: vscode.Uri) {
    const from = relPath(this.root, oldUri)
    const to = relPath(this.root, newUri)
    if (!from) return
    const keys = this.keysUnder(oldUri)
    if (keys.length === 0) {
      // Renamed into the co-op from a name the co-op skips.
      this.enqueue(() => this.addFromDisk(newUri))
      return
    }

    const moved: string[] = []
    this.doc.transact(() => {
      for (const key of keys) {
        const text = this.files.get(key)?.toString() ?? ''
        const known = this.disk.get(key)
        this.files.delete(key)
        this.saves.delete(key)
        this.conflicts.delete(key)
        this.disk.delete(key)
        if (!to) continue
        const target = to + key.slice(from.length)
        // Only keep it if the new name is something the co-op carries.
        if (!relKey(this.root, keyToUri(this.root, target))) continue
        this.files.set(target, textOf(text))
        if (known !== undefined) this.disk.set(target, known)
        moved.push(target)
      }
    }, LOCAL)
    moved.forEach(key => this.watch(key))
  }

  // ----------------------------------------------------- the host's own disk

  private scheduleHostCheck (uri: vscode.Uri) {
    if (!this.ready) return
    const fsPath = uri.fsPath
    const existing = this.hostChecks.get(fsPath)
    if (existing) clearTimeout(existing)
    // Editors often save by delete-then-rename. Waiting a moment and looking
    // at what is actually there turns that into one change, not a delete.
    this.hostChecks.set(fsPath, setTimeout(() => {
      this.hostChecks.delete(fsPath)
      this.enqueue(() => this.hostCheck(uri))
    }, 300))
  }

  private async hostCheck (uri: vscode.Uri): Promise<void> {
    if (await isDirectory(uri)) {
      const rel = relPath(this.root, uri) ?? ''
      const onDisk = await scanFiles(this.root, rel)
      for (const key of onDisk) await this.hostCheckKey(key)
      return
    }
    if (!await exists(uri)) {
      // Gone: a file, or a whole folder.
      const keys = this.keysUnder(uri)
      if (keys.length > 0) this.dropKeysUnder(uri)
      return
    }
    const key = relKey(this.root, uri)
    if (key) await this.hostCheckKey(key)
  }

  private async hostCheckKey (key: string): Promise<void> {
    const text = await readText(this.root, key)
    if (text === null) return
    await this.hostChanged(key, text)
  }

  /**
   * The host's disk now holds `text` for this file. Push it into the co-op -
   * unless someone has unsaved co-op work in the file, in which case ask.
   */
  private async hostChanged (key: string, text: string): Promise<void> {
    const known = this.disk.get(key)
    if (text === known) return

    const ytext = this.files.get(key)
    if (!ytext) {
      this.disk.set(key, text)
      this.doc.transact(() => this.files.set(key, textOf(text)), LOCAL)
      this.watch(key)
      return
    }

    const live = ytext.toString()
    if (text === live) {
      this.disk.set(key, text)
      if (this.conflicts.has(key)) this.doc.transact(() => this.conflicts.delete(key), LOCAL)
      return
    }

    if (known === undefined || live === known) {
      // Nobody had unsaved work here: the host's disk just moves the co-op on.
      this.disk.set(key, text)
      this.doc.transact(() => {
        replaceText(ytext, text)
        this.markSaved(key)
      }, LOCAL)
      const open = this.openDoc(key)
      if (open) {
        await this.applyToBuffer(open, text)
        if (open.isDirty) await this.saveQuietly(open)
      }
      return
    }

    const pending = this.conflicts.get(key)
    if (pending?.text === text) return
    const conflict: Conflict = {
      id: Math.random().toString(36).slice(2),
      key,
      text,
      by: this.opts.userName,
      at: Date.now()
    }
    // The observer tells everyone, us included.
    this.doc.transact(() => this.conflicts.set(key, conflict), LOCAL)
  }

  /** Looks at the whole folder again, for changes the watcher did not report. */
  private async hostRescan (): Promise<void> {
    if (!this.ready || Date.now() - this.lastRescan < 5000) return
    this.lastRescan = Date.now()
    const onDisk = new Set(await scanFiles(this.root))
    for (const key of onDisk) await this.hostCheckKey(key)
    for (const key of Array.from(this.disk.keys())) {
      if (!onDisk.has(key) && this.files.has(key)) {
        this.dropKeysUnder(keyToUri(this.root, key))
      }
    }
  }

  // ---------------------------------------------------------------- conflicts

  conflictFor (key: string): Conflict | undefined {
    return this.conflicts.get(key)
  }

  /**
   * Settles a conflict. 'host' takes what is on the host's disk and drops the
   * unsaved co-op work; 'coop' keeps the co-op's text and saves it over the
   * host's file. Returns false if somebody else already settled it.
   */
  resolveConflict (key: string, id: string, keep: 'host' | 'coop'): boolean {
    const conflict = this.conflicts.get(key)
    const ytext = this.files.get(key)
    if (!conflict || conflict.id !== id || !ytext) return false
    this.doc.transact(() => {
      if (keep === 'host') replaceText(ytext, conflict.text)
      this.conflicts.delete(key)
      this.markSaved(key)
    }, LOCAL)
    // Our own copy follows too: the observer only redraws for remote edits.
    this.schedulePull(key)
    return true
  }

  /**
   * Host only, after the drift question at join: push these files from the
   * host's disk into the co-op. Missing files are removed from the co-op.
   */
  async adoptHostDisk (keys: string[]): Promise<number> {
    let done = 0
    for (const key of keys) {
      await this.enqueue(async () => {
        const text = await readText(this.root, key)
        const ytext = this.files.get(key)
        if (text === null) {
          if (ytext) this.dropKeysUnder(keyToUri(this.root, key))
        } else if (ytext) {
          this.disk.set(key, text)
          this.doc.transact(() => { replaceText(ytext, text); this.markSaved(key) }, LOCAL)
          const open = this.openDoc(key)
          if (open) {
            await this.applyToBuffer(open, text)
            if (open.isDirty) await this.saveQuietly(open)
          }
        }
        done++
      })
    }
    return done
  }

  /**
   * Said once, not on every keystroke. The edit still sits in their editor -
   * we simply never publish it, and the next remote change will overwrite it.
   */
  private nagReadOnly () {
    if (this.warnedReadOnly) return
    this.warnedReadOnly = true
    vscode.window.showWarningMessage(
      `คุณเข้า co-op "${this.opts.coopName}" แบบอ่านอย่างเดียว - สิ่งที่พิมพ์จะไม่ถูกส่งให้คนอื่น และจะหายเมื่อมีคนแก้ไฟล์นี้`
    )
  }

  // ------------------------------------------------------------- who is where

  private publishCursor (editor: vscode.TextEditor) {
    const key = relKey(this.root, editor.document.uri)
    if (!key) {
      this.provider.awareness.setLocalStateField('cursor', null)
      return
    }
    const sel = editor.selection
    const cursor: RemoteCursor = {
      key,
      anchor: editor.document.offsetAt(sel.anchor),
      head: editor.document.offsetAt(sel.active)
    }
    this.provider.awareness.setLocalStateField('cursor', cursor)
  }

  private renderPresence () {
    const peers = new Map<number, { user: RemoteUser, cursor?: RemoteCursor }>()
    this.provider.awareness.getStates().forEach((state: any, clientId: number) => {
      if (clientId === this.doc.clientID) return
      const user: RemoteUser = state?.user ?? { name: 'someone', color: colorFor('someone') }
      peers.set(clientId, { user, cursor: state?.cursor ?? undefined })
    })
    this.presence.render(peers)
  }

  /** Everyone in the room right now, me first. */
  peers (): Peer[] {
    const list: Peer[] = []
    this.provider.awareness.getStates().forEach((state: any, clientId: number) => {
      const user = state?.user
      if (!user) return
      list.push({
        clientId,
        name: user.name ?? 'someone',
        color: user.color ?? colorFor('someone'),
        role: user.role,
        file: state?.cursor?.key ?? undefined,
        isMe: clientId === this.doc.clientID
      })
    })
    return list.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name))
  }

  /** Where a peer's cursor is, for "go to where they are". */
  cursorOf (clientId: number): RemoteCursor | undefined {
    return (this.provider.awareness.getStates().get(clientId) as any)?.cursor ?? undefined
  }

  /**
   * Changes the name and colour everyone else sees, in place.
   *
   * Awareness is a live broadcast rather than part of the document, so this
   * needs no reconnect: the other windows redraw on the next change event.
   */
  setUserName (name: string, color: string) {
    this.opts.userName = name
    this.opts.color = color
    this.provider.awareness.setLocalStateField('user', { name, color, role: this.opts.role })
  }

  get userName (): string { return this.opts.userName }

  // ----------------------------------------------------------------- checking

  /** The co-op's copy of a file, for showing next to the local one. */
  sharedText (key: string): string | undefined {
    return this.files.get(key)?.toString()
  }

  /**
   * Compares the folder on disk against the shared doc.
   *
   * Open editors are compared by their buffer rather than their file, because
   * that is the text the person is actually looking at - an unsaved change is
   * a real difference worth reporting, not a false match.
   */
  async verify (): Promise<VerifyReport> {
    const onDisk = new Set(await scanFiles(this.root))
    const different: string[] = []
    const missingLocal: string[] = []
    const unreadable: string[] = []
    let matched = 0

    for (const key of Array.from(this.files.keys())) {
      const target = this.files.get(key)?.toString()
      if (target === undefined) continue
      if (!onDisk.has(key)) {
        missingLocal.push(key)
        continue
      }
      const open = this.openDoc(key)
      const mine = open ? open.getText() : await readText(this.root, key)
      if (mine === null) unreadable.push(key)
      else if (mine === target) matched++
      else different.push(key)
    }

    // A local file the co-op never took can be either of two very different
    // things - one the co-op has not seen yet, or one it can never carry - and
    // telling someone their file "is not shared" without saying which is why
    // they would go looking for a bug that is not there.
    const notShared: string[] = []
    for (const key of onDisk) {
      if (this.files.has(key)) continue
      if (await readText(this.root, key) === null) unreadable.push(key)
      else notShared.push(key)
    }

    const sorted = (a: string[]) => a.sort((x, y) => x.localeCompare(y))

    return {
      total: this.files.size,
      matched,
      different: sorted(different),
      missingLocal: sorted(missingLocal),
      notShared: sorted(notShared),
      unreadable: sorted(unreadable)
    }
  }

  /**
   * Makes the local copies of these files match the co-op, on disk.
   *
   * Goes through the same queue as an incoming remote change, so a pull cannot
   * race the edits still arriving from the other side.
   */
  async pull (keys: string[]): Promise<number> {
    let done = 0
    for (const key of keys) {
      if (!this.files.has(key)) continue
      await this.enqueue(() => this.writeSaved(key))
      done++
    }
    return done
  }

  // ------------------------------------------------------------------ closing

  dispose () {
    this.dead = true
    this.pending.forEach(t => clearTimeout(t))
    this.hostChecks.forEach(t => clearTimeout(t))
    this.disposables.forEach(d => d.dispose())
    this.presence.dispose()
    this.provider.awareness.setLocalState(null)
    this.provider.destroy()
    this.doc.destroy()
    this.hooks.onStatus('offline', 0)
  }
}

function textOf (text: string): Y.Text {
  const ytext = new Y.Text()
  ytext.insert(0, text)
  return ytext
}

/** The one range where `current` and `target` differ. */
export function diffRange (current: string, target: string) {
  let start = 0
  const minLen = Math.min(current.length, target.length)
  while (start < minLen && current[start] === target[start]) start++
  let endCur = current.length
  let endTar = target.length
  while (endCur > start && endTar > start && current[endCur - 1] === target[endTar - 1]) {
    endCur--
    endTar--
  }
  // Never cut a surrogate pair in half.
  if (start > 0 && isLowSurrogate(current.charCodeAt(start))) start--
  return { start, endCur, endTar }
}

/** Rewrites a Y.Text to `target`, touching only the range that changed. */
export function replaceText (ytext: Y.Text, target: string) {
  const current = ytext.toString()
  if (current === target) return
  const { start, endCur, endTar } = diffRange(current, target)
  if (endCur > start) ytext.delete(start, endCur - start)
  if (endTar > start) ytext.insert(start, target.slice(start, endTar))
}

async function exists (uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

function isLowSurrogate (code: number) {
  return code >= 0xdc00 && code <= 0xdfff
}
