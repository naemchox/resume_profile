import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import {
  Invite, InviteError, Role, closeCoop, createCoop, decodeInvite, encodeInvite,
  fetchRoleToken, rotateRoleToken, verifyInvite
} from './invite'
import { colorFor } from './presence'
import { chooseJoinFolder, forgetFolders } from './sessionFolder'
import { requireServer, setupServer } from './hosting'
import { Conflict, CoopSession, CoopStatus, HostDrift, VerifyReport, fixable } from './coop'
import { CurrentRoomView, RoomEntry, RoomListView, RoomRegistry } from './rooms'

let session: CoopSession | undefined
let status: CoopStatus = 'offline'
let statusBar: vscode.StatusBarItem
let ctx: vscode.ExtensionContext
let rooms: RoomRegistry
let currentView: CurrentRoomView
let roomList: RoomListView
let currentTree: vscode.TreeView<unknown>

// The invite carries a token, so it never goes in .vscode/settings.json where
// it would ride along into git. SecretStorage is per machine and per folder.
const secretKey = (folder: vscode.Uri) => `coop.invite:${folder.fsPath}`

export function activate (context: vscode.ExtensionContext) {
  ctx = context

  rooms = new RoomRegistry(context)
  currentView = new CurrentRoomView(() => session, () => status)
  roomList = new RoomListView(rooms, () => session, probeRoom)

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  setStatus('offline', 0)
  statusBar.show()

  const roomsTree = vscode.window.createTreeView('coop.rooms', { treeDataProvider: roomList })
  currentTree = vscode.window.createTreeView('coop.current', { treeDataProvider: currentView as any })
  showMyName()
  roomsTree.onDidChangeVisibility(e => { if (e.visible) roomList.refresh(true) })

  context.subscriptions.push(
    statusBar,
    roomsTree,
    currentTree,
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('coop.userName')) showMyName()
    }),
    vscode.workspace.registerTextDocumentContentProvider(SHARED_SCHEME, sharedProvider),
    vscode.workspace.registerTextDocumentContentProvider(CONFLICT_SCHEME, conflictProvider),
    vscode.commands.registerCommand('coop.refreshRooms', () => roomList.refresh(true)),
    vscode.commands.registerCommand('coop.switchRoom', (entry?: RoomEntry) => switchRoom(entry, false)),
    vscode.commands.registerCommand('coop.openRoomNewWindow', (entry?: RoomEntry) => switchRoom(entry, true)),
    vscode.commands.registerCommand('coop.forgetRoom', forgetRoom),
    vscode.commands.registerCommand('coop.followPeer', followPeer),
    vscode.commands.registerCommand('coop.setupServer', () => setupServer(context)),
    vscode.commands.registerCommand('coop.create', createAndJoin),
    vscode.commands.registerCommand('coop.joinWithCode', joinWithCode),
    vscode.commands.registerCommand('coop.join', rejoin),
    vscode.commands.registerCommand('coop.leave', leave),
    vscode.commands.registerCommand('coop.copyInvite', copyInvite),
    vscode.commands.registerCommand('coop.rotateInvite', rotateInvite),
    vscode.commands.registerCommand('coop.verifyFiles', verifyFiles),
    vscode.commands.registerCommand('coop.rename', renameMe),
    vscode.commands.registerCommand('coop.menu', menu),
    vscode.commands.registerCommand('coop.reset', resetLocalState),
    { dispose: leave }
  )

  void resumePendingJoin()
}

const PENDING_KEY = 'coop.pendingJoin'

/**
 * Joining means opening a different folder, which restarts the extension host.
 * The invite is parked here beforehand and picked up once the new window is
 * the one we were aiming at.
 */
async function resumePendingJoin () {
  const pending = ctx.globalState.get<{ path: string, code: string }>(PENDING_KEY)
  const here = vscode.workspace.workspaceFolders?.[0]

  if (pending && here && here.uri.fsPath === pending.path) {
    await ctx.globalState.update(PENDING_KEY, undefined)
    const invite = decodeInvite(pending.code)
    if (invite) {
      await connect(here.uri, invite)
      return
    }
  }

  if (vscode.workspace.getConfiguration('coop').get<boolean>('autoJoin')) {
    await rejoin(true)
  }
}

export function deactivate () {
  leave()
}

// ---------------------------------------------------------------- status bar

function setStatus (next: CoopStatus, peers: number) {
  status = session ? next : 'offline'
  void vscode.commands.executeCommand('setContext', 'coop.inRoom', !!session)
  currentView?.refresh()
  statusBar.command = 'coop.menu'
  if (status === 'offline' || !session) {
    statusBar.text = '$(circle-slash) Co-op: offline'
    statusBar.tooltip = 'คลิกเพื่อสร้างหรือเข้า co-op'
    return
  }
  const name = session.coopName
  if (status === 'connecting') {
    statusBar.text = `$(sync~spin) Co-op: กำลังต่อ "${name}"`
    statusBar.tooltip = name
    return
  }
  const others = Math.max(peers - 1, 0)
  const who = others === 0 ? 'มีแค่คุณ' : `อีก ${others} คน`
  const readOnly = session.role === 'viewer' ? ' $(eye)' : ''
  statusBar.text = `$(broadcast) ${name}${readOnly} (${who})`
  statusBar.tooltip = `coop: ${name}\nสิทธิ์: ${session.role}\nคลิกเพื่อดูตัวเลือก`
}

async function menu () {
  const items: Array<vscode.QuickPickItem & { run: () => any }> = session
    ? [
        { label: '$(clippy) คัดลอก invite ให้เพื่อน', run: copyInvite },
        { label: '$(key) ยกเลิก invite เดิมแล้วออกใหม่', run: rotateInvite },
        { label: '$(checklist) เทียบไฟล์กับ co-op', run: verifyFiles },
        { label: '$(account) เปลี่ยนชื่อที่เพื่อนเห็น', run: renameMe },
        { label: '$(sign-out) ออกจาก co-op', run: leave }
      ]
    : [
        { label: '$(add) สร้าง co-op จากโฟลเดอร์นี้', run: createAndJoin },
        { label: '$(cloud-upload) ตั้งเซิร์ฟเวอร์ของฉัน (Cloudflare)', run: () => setupServer(ctx) },
        { label: '$(link) เข้าด้วย invite code', run: joinWithCode },
        { label: '$(debug-start) เข้า co-op เดิมของโฟลเดอร์นี้', run: () => rejoin() },
        { label: '$(list-unordered) ห้องทั้งหมดของฉัน', run: () => vscode.commands.executeCommand('coop.rooms.focus') },
        { label: '$(account) เปลี่ยนชื่อที่เพื่อนเห็น', run: renameMe }
      ]
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Co-op' })
  await picked?.run()
}

// --------------------------------------------------------------- join / leave

function currentFolder (): vscode.WorkspaceFolder | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    vscode.window.showErrorMessage('เปิดโฟลเดอร์ก่อน - co-op ใช้ sync ทั้งโฟลเดอร์')
  }
  return folder
}

async function storedInvite (folder: vscode.Uri): Promise<Invite | undefined> {
  const code = await ctx.secrets.get(secretKey(folder))
  return code ? decodeInvite(code) ?? undefined : undefined
}

async function connect (folder: vscode.Uri, invite: Invite) {
  // Switching co-op used to bail out here, which left the previously stored
  // invite in place - so "copy invite" kept handing out the old co-op's link
  // no matter how many new ones you made. Leave the old one and carry on.
  if (session) leave()

  let info
  try {
    // Checked over http first: a bad invite says why, instead of a websocket
    // retrying in silence.
    info = await verifyInvite(invite)
  } catch (err) {
    if (err instanceof InviteError && err.permanent) {
      await rooms.markClosed(invite.coopId)
      roomList.refresh()
    }
    vscode.window.showErrorMessage(`Co-op: ${err instanceof Error ? err.message : err}`)
    return
  }

  await ctx.secrets.store(secretKey(folder), encodeInvite(invite))
  await rooms.upsert({
    coopId: info.coopId,
    name: info.name,
    role: info.role,
    folder: folder.fsPath,
    serverUrl: invite.serverUrl,
    lastUsed: Date.now()
  })

  const cfg = vscode.workspace.getConfiguration('coop')
  const userName = cfg.get<string>('userName') || defaultUserName()

  let made: CoopSession | undefined
  try {
    made = new CoopSession(
      folder,
      {
        serverUrl: invite.serverUrl,
        coopId: invite.coopId,
        coopName: info.name,
        token: invite.token,
        role: info.role,
        userName,
        color: cfg.get<string>('color') || colorFor(userName)
      },
      {
        onStatus: setStatus,
        onReady: () => {
          // The host gets the drift question instead: their disk is the truth.
          if (made && made.role !== 'owner') void verifyOnJoin(made)
        },
        onPeers: () => currentView.refresh(),
        onHostDrift: drift => { if (made) void askHostDrift(made, drift) },
        onConflict: conflict => { if (made) void askConflict(made, conflict) },
        onClosed: reason => { if (made) void roomClosed(made, reason) }
      }
    )
    session = made
    setStatus('connecting', 0)
    roomList.refresh()
    if (info.role === 'viewer') {
      vscode.window.showInformationMessage(`เข้า "${info.name}" แบบอ่านอย่างเดียว`)
    }
  } catch (err) {
    session = undefined
    setStatus('offline', 0)
    vscode.window.showErrorMessage(`Co-op: เข้าไม่ได้ - ${err instanceof Error ? err.message : err}`)
  }
}

async function rejoin (quiet = false) {
  const folder = currentFolder()
  if (!folder) return
  const invite = await storedInvite(folder.uri)
  if (!invite) {
    if (!quiet) {
      const pick = await vscode.window.showInformationMessage(
        'โฟลเดอร์นี้ยังไม่ได้ผูกกับ co-op ไหน',
        'สร้าง co-op', 'ใส่ invite code'
      )
      if (pick === 'สร้าง co-op') await createAndJoin()
      if (pick === 'ใส่ invite code') await joinWithCode()
    }
    return
  }
  await connect(folder.uri, invite)
}

/**
 * Asked BEFORE we create or join anything. Creating a co-op first and finding
 * out afterwards that we cannot join it leaves an orphan on the server and an
 * invite nobody is sitting in.
 */
async function ensureNotJoined (): Promise<boolean> {
  if (!session) return true
  const pick = await vscode.window.showWarningMessage(
    `ตอนนี้อยู่ใน co-op "${session.coopName}" - ต้องออกก่อน`,
    { modal: true },
    'ออกแล้วไปต่อ'
  )
  if (pick !== 'ออกแล้วไปต่อ') return false
  leave()
  return true
}

async function createAndJoin () {
  const folder = currentFolder()
  if (!folder) return

  // Pressing "create" on a folder that already has a room used to make a
  // second room silently, leaving friends on the old invite in an empty one.
  const replacing = await checkExistingRoom(folder.uri)
  if (replacing === 'cancel') return
  if (replacing === 'rejoined') return

  if (replacing && session?.coopId === replacing.coopId) leave()
  else if (!await ensureNotJoined()) return

  const name = await vscode.window.showInputBox({
    prompt: 'ตั้งชื่อ co-op',
    value: path.basename(folder.uri.fsPath)
  })
  if (name === undefined) return

  // Creating needs a server; joining does not, because the invite carries one.
  const serverUrl = await requireServer(ctx)
  if (!serverUrl) return

  let created
  try {
    created = await createCoop(serverUrl, name || 'co-op', path.basename(folder.uri.fsPath))
  } catch (err) {
    vscode.window.showErrorMessage(`Co-op: ${err instanceof Error ? err.message : err}`)
    return
  }

  if (replacing) {
    try {
      const closed = await closeCoop(replacing)
      if (!closed) {
        vscode.window.showWarningMessage(
          'เซิร์ฟเวอร์ยังเป็นรุ่นเก่า ปิดห้องเดิมให้ไม่ได้ - ห้องเดิมยังเปิดอยู่ ' +
          '(อัปเดตเซิร์ฟเวอร์ด้วย "ตั้งเซิร์ฟเวอร์ของฉัน" หรือ npm run deploy ในโฟลเดอร์ worker)'
        )
      }
      await rooms.markClosed(replacing.coopId)
    } catch (err) {
      vscode.window.showWarningMessage(`ปิดห้องเดิมไม่สำเร็จ: ${err instanceof Error ? err.message : err}`)
    }
  }

  // We keep the owner invite; friends get the editor or viewer one.
  const ownerInvite: Invite = {
    serverUrl,
    coopId: created.coopId,
    token: created.tokens.owner,
    name: created.name
  }
  await connect(folder.uri, ownerInvite)

  const pick = await vscode.window.showInformationMessage(
    replacing
      ? `สร้างห้องใหม่ "${created.name}" แล้ว - ห้องเดิมถูกปิด ส่ง invite ใหม่ให้เพื่อนด้วย`
      : `สร้าง co-op "${created.name}" แล้ว`,
    'คัดลอก invite (แก้ไขได้)', 'คัดลอก invite (อ่านอย่างเดียว)'
  )
  if (!pick) return
  const role: Role = pick.includes('อ่านอย่างเดียว') ? 'viewer' : 'editor'
  await copyInviteFor(ownerInvite, created.name, role)
}

/**
 * What to do when this folder already belongs to a room.
 * Returns the old owner invite when the person chose to replace it, undefined
 * when there is nothing in the way.
 */
async function checkExistingRoom (folder: vscode.Uri): Promise<Invite | 'cancel' | 'rejoined' | undefined> {
  const existing = await storedInvite(folder)
  if (!existing) return undefined

  const inThisRoom = session?.coopId === existing.coopId
  let name = session?.coopName
  let role = session?.role
  if (!inThisRoom) {
    try {
      const info = await verifyInvite(existing)
      name = info.name
      role = info.role
    } catch {
      return undefined // the old room is gone already; nothing to replace
    }
  }

  const back = `กลับเข้าห้องเดิม "${name}"`
  const fresh = 'สร้างห้องใหม่แทน'
  const buttons = inThisRoom ? [fresh] : [back, fresh]
  const pick = await vscode.window.showWarningMessage(
    inThisRoom
      ? `ตอนนี้คุณอยู่ในห้อง "${name}" ของโฟลเดอร์นี้อยู่แล้ว`
      : `โฟลเดอร์นี้มีห้อง "${name}" อยู่แล้ว`,
    {
      modal: true,
      detail: role === 'owner'
        ? 'ปกติให้กลับเข้าห้องเดิม เพื่อนจะใช้ invite เดิมเข้าได้ตามปกติ\n\n' +
          'ถ้าสร้างห้องใหม่: ห้องเดิมจะถูกปิด ทุกคนในห้องจะหลุด และ invite เดิมที่ส่งไปแล้วจะใช้ไม่ได้ ต้องส่ง invite ใหม่ให้เพื่อน'
        : 'โฟลเดอร์นี้เป็นสำเนาของห้องที่คุณเข้าร่วม ถ้าสร้างห้องใหม่ โฟลเดอร์จะถูกผูกกับห้องใหม่แทน (ห้องของเพื่อนไม่ถูกปิด)'
    },
    ...buttons
  )
  if (pick === back) {
    await connect(folder, existing)
    return 'rejoined'
  }
  if (pick !== fresh) return 'cancel'
  // Only the owner can close a room; a guest just moves the folder over.
  return role === 'owner' ? existing : undefined
}

async function joinWithCode () {
  if (!await ensureNotJoined()) return

  const code = await vscode.window.showInputBox({
    prompt: 'วาง invite code ที่เพื่อนส่งมา',
    placeHolder: 'COOP1-...',
    ignoreFocusOut: true
  })
  if (!code) return

  const invite = decodeInvite(code)
  if (!invite) {
    vscode.window.showErrorMessage('invite code ไม่ถูกต้อง - ต้องขึ้นต้นด้วย COOP1-')
    return
  }

  // Check the invite before asking anyone to pick folders.
  let info
  try {
    info = await verifyInvite(invite)
  } catch (err) {
    vscode.window.showErrorMessage(`Co-op: ${err instanceof Error ? err.message : err}`)
    return
  }

  const target = await chooseJoinFolder(
    ctx,
    info.coopId,
    info.name,
    info.folderName || info.name
  )
  if (!target) return

  const here = vscode.workspace.workspaceFolders?.[0]
  if (here && here.uri.fsPath === target.fsPath) {
    await connect(target, invite)
    return
  }

  // The folder we are about to open is a different workspace, so hand the
  // invite to the next window rather than trying to hold it across the reload.
  await ctx.secrets.store(secretKey(target), encodeInvite(invite))
  await ctx.globalState.update(PENDING_KEY, { path: target.fsPath, code: encodeInvite(invite) })
  await vscode.commands.executeCommand('vscode.openFolder', target, { forceNewWindow: false })
}

function leave () {
  if (!session) return
  session.dispose()
  session = undefined
  setStatus('offline', 0)
  roomList?.refresh()
}

// ---------------------------------------------------------------- the sidebar

async function probeRoom (entry: RoomEntry) {
  const invite = await storedInvite(vscode.Uri.file(entry.folder))
  if (!invite) return {}
  try {
    const info = await verifyInvite(invite)
    return { online: info.online }
  } catch (err) {
    if (err instanceof InviteError && err.permanent) return { closed: true, error: err.message }
    throw err
  }
}

/**
 * Moves this window to another room. A room is a folder, so this opens that
 * folder and the next window picks the invite up and joins.
 */
async function switchRoom (entry: RoomEntry | undefined, newWindow: boolean) {
  if (!entry) {
    const picked = await vscode.window.showQuickPick(
      rooms.all().filter(r => !r.closed).map(r => ({ label: r.name, description: r.folder, entry: r })),
      { placeHolder: 'เปลี่ยนไปห้องไหน' }
    )
    if (!picked) return
    entry = picked.entry
  }

  const folder = vscode.Uri.file(entry.folder)
  try {
    await vscode.workspace.fs.stat(folder)
  } catch {
    const pick = await vscode.window.showErrorMessage(
      `ไม่พบโฟลเดอร์ของห้อง "${entry.name}" แล้ว (${entry.folder})`,
      'เอาออกจากรายการ'
    )
    if (pick) await forgetRoom(entry)
    return
  }

  const code = await ctx.secrets.get(secretKey(folder))
  const invite = code ? decodeInvite(code) : null
  if (!invite || invite.coopId !== entry.coopId) {
    vscode.window.showErrorMessage(`ไม่พบ invite ของห้อง "${entry.name}" ในเครื่องนี้ - ขอ invite ใหม่แล้วใช้ "เข้าด้วย invite code"`)
    return
  }

  const here = vscode.workspace.workspaceFolders?.[0]
  if (!newWindow && here && here.uri.fsPath === folder.fsPath) {
    await connect(folder, invite)
    return
  }
  await ctx.globalState.update(PENDING_KEY, { path: folder.fsPath, code: encodeInvite(invite) })
  await vscode.commands.executeCommand('vscode.openFolder', folder, { forceNewWindow: newWindow })
}

async function forgetRoom (entry?: RoomEntry) {
  if (!entry) return
  const go = await vscode.window.showWarningMessage(
    `เอาห้อง "${entry.name}" ออกจากรายการ?`,
    { modal: true, detail: 'ลืม invite ที่เก็บไว้ในเครื่องนี้ ไฟล์ในโฟลเดอร์ไม่ถูกลบ และห้องบนเซิร์ฟเวอร์ไม่ถูกปิด' },
    'เอาออก'
  )
  if (go !== 'เอาออก') return
  if (session && session.root.fsPath === entry.folder) leave()
  await rooms.remove(entry.folder)
  await ctx.secrets.delete(secretKey(vscode.Uri.file(entry.folder)))
  roomList.refresh()
}

/** Opens the file a friend is in and puts the cursor where theirs is. */
async function followPeer (clientId?: number) {
  if (!session || clientId === undefined) return
  const cursor = session.cursorOf(clientId)
  if (!cursor) return
  const uri = vscode.Uri.joinPath(session.root, ...cursor.key.split('/'))
  const editor = await vscode.window.showTextDocument(uri, { preview: false })
  const pos = editor.document.positionAt(cursor.head)
  editor.selection = new vscode.Selection(pos, pos)
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
}

// -------------------------------------------------- host disk vs the co-op

/** The server shut this room. Say so plainly and stop retrying. */
async function roomClosed (live: CoopSession, reason: string) {
  if (session !== live) return
  await rooms.markClosed(live.coopId)
  leave()
  const pick = await vscode.window.showErrorMessage(`Co-op: ${reason}`, 'วาง invite ใหม่')
  if (pick) await joinWithCode()
}

/**
 * The host walked into a room whose files differ from their disk - they
 * edited outside while away, or friends kept working without them.
 */
async function askHostDrift (live: CoopSession, drift: HostDrift) {
  const keys = [...drift.different, ...drift.missing]
  const listed = keys.slice(0, 10).join('\n') + (keys.length > 10 ? `\n...อีก ${keys.length - 10} ไฟล์` : '')
  const mine = 'ใช้ของเครื่องฉัน'
  const theirs = 'ใช้ของ co-op'
  const look = 'ดูรายการ'
  const pick = await vscode.window.showWarningMessage(
    `"${live.coopName}": ${keys.length} ไฟล์บนเครื่องคุณไม่ตรงกับในห้อง`,
    {
      modal: true,
      detail:
        'คุณเป็นเจ้าของห้อง เครื่องคุณคือตัวหลัก\n' +
        `• ${mine}: ส่งไฟล์จากเครื่องคุณเข้าห้อง เพื่อนจะได้ของคุณ (ไฟล์ที่คุณลบไปแล้วจะถูกลบจากห้องด้วย)\n` +
        `• ${theirs}: เอาของในห้องมาเขียนทับเครื่องคุณ (เลือกอันนี้ถ้าเพื่อนแก้งานไว้ระหว่างคุณไม่อยู่)\n\n` +
        listed
    },
    mine, theirs, look
  )
  if (session !== live) return
  if (pick === mine) {
    const n = await live.adoptHostDisk(keys)
    vscode.window.showInformationMessage(`ส่งของเครื่องคุณเข้าห้องแล้ว ${n} ไฟล์`)
  } else if (pick === theirs) {
    const n = await live.pull(keys)
    vscode.window.showInformationMessage(`เอาของในห้องลงเครื่องแล้ว ${n} ไฟล์`)
  } else if (pick === look) {
    await showReport(live, await live.verify())
  }
}

const askedConflicts = new Set<string>()

/**
 * The host changed a file outside the co-op while someone had unsaved work in
 * it. Everyone who can write is asked; the first answer wins.
 */
async function askConflict (live: CoopSession, conflict: Conflict, again = false) {
  if (!again && askedConflicts.has(conflict.id)) return
  askedConflicts.add(conflict.id)

  const byMe = live.role === 'owner'
  const useHost = byMe ? 'ใช้ของเครื่องฉัน' : 'ใช้ของเครื่องเจ้าของ'
  const keep = 'เก็บงานในห้อง'
  const diff = 'ดูความต่าง'
  const pick = await vscode.window.showWarningMessage(
    byMe
      ? `"${conflict.key}" ถูกแก้นอก co-op แต่ในห้องยังมีงานที่ยังไม่เซฟ - จะเอาอันไหน`
      : `"${conflict.key}": ${conflict.by} (เจ้าของ) แก้ไฟล์นี้นอก co-op แต่ในห้องยังมีงานที่ยังไม่เซฟ - จะเอาอันไหน`,
    useHost, keep, diff
  )
  if (session !== live) return
  const current = live.conflictFor(conflict.key)
  if (!pick) return
  if (!current || current.id !== conflict.id) {
    if (pick !== diff) vscode.window.showInformationMessage(`"${conflict.key}": มีคนเลือกไปแล้ว`)
    return
  }
  if (pick === diff) {
    await vscode.commands.executeCommand(
      'vscode.diff', conflictUri(conflict.key), sharedUri(conflict.key),
      `${conflict.key} (เครื่องเจ้าของ ↔ งานในห้อง)`
    )
    await askConflict(live, conflict, true)
    return
  }
  const done = live.resolveConflict(conflict.key, conflict.id, pick === keep ? 'coop' : 'host')
  if (!done) vscode.window.showInformationMessage(`"${conflict.key}": มีคนเลือกไปแล้ว`)
}

/**
 * Wipes everything this extension remembers on this machine.
 *
 * Needed because uninstalling an extension does NOT clear its SecretStorage or
 * globalState - reinstalling picks the old state right back up, which is how a
 * "fresh" install ends up joining into "startup (3)".
 */
async function resetLocalState () {
  const go = await vscode.window.showWarningMessage(
    'ล้างข้อมูล co-op ที่จำไว้ในเครื่องนี้ทั้งหมด: invite ที่เก็บไว้, โฟลเดอร์ที่เคย join, และที่ตั้งของ "coop session"',
    { modal: true, detail: 'ไฟล์ในโฟลเดอร์ไม่ถูกลบ และ co-op บนเซิร์ฟเวอร์ไม่ถูกแตะต้อง' },
    'ล้างเลย'
  )
  if (go !== 'ล้างเลย') return

  leave()
  await forgetFolders(ctx)
  for (const entry of rooms.all()) await ctx.secrets.delete(secretKey(vscode.Uri.file(entry.folder)))
  await rooms.clear()
  roomList.refresh()
  await ctx.globalState.update(PENDING_KEY, undefined)
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    await ctx.secrets.delete(secretKey(folder.uri))
  }
  vscode.window.showInformationMessage('ล้างข้อมูลในเครื่องแล้ว')
}

// --------------------------------------------------------------- verification

// Lets the co-op's copy of a file be opened like any other document, so the
// diff view can put it side by side with what is on disk. Read-only by nature:
// nothing writes back through this scheme.
const SHARED_SCHEME = 'coop-shared'

const sharedProvider: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent (uri) {
    return session?.sharedText(uri.path.replace(/^\//, '')) ?? ''
  }
}

function sharedUri (key: string): vscode.Uri {
  return vscode.Uri.from({ scheme: SHARED_SCHEME, path: '/' + key })
}

// What the host's disk holds for a file that is in conflict.
const CONFLICT_SCHEME = 'coop-conflict'

const conflictProvider: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent (uri) {
    return session?.conflictFor(uri.path.replace(/^\//, ''))?.text ?? ''
  }
}

function conflictUri (key: string): vscode.Uri {
  return vscode.Uri.from({ scheme: CONFLICT_SCHEME, path: '/' + key })
}

/**
 * "Do my friend and I have the same files?"
 *
 * Asked against the shared doc rather than the other person's machine: both of
 * us sync to it, so if each side matches it, the two sides match each other.
 */
async function verifyFiles () {
  if (!session) {
    vscode.window.showErrorMessage('ต้องอยู่ใน co-op ก่อน จึงจะเทียบไฟล์ได้')
    return
  }
  const live = session

  const report = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'เทียบไฟล์กับ co-op...' },
    () => live.verify()
  )

  const problems =
    report.different.length + report.missingLocal.length +
    report.notShared.length + report.unreadable.length

  if (problems === 0) {
    vscode.window.showInformationMessage(
      `ไฟล์ตรงกับ co-op ทั้งหมด ${report.matched} ไฟล์ - เพื่อนที่เทียบแล้วผ่านเหมือนกัน ถือว่ามีไฟล์ชุดเดียวกัน`
    )
    return
  }
  await showReport(live, report)
}

/**
 * The same check, run by itself the moment a folder and a co-op finish meeting.
 *
 * Only ever asks about what overwriting can fix. A folder always has files of
 * its own that the co-op does not carry, and warning about those on every join
 * would train people to dismiss the thing without reading it.
 */
async function verifyOnJoin (live: CoopSession) {
  if (!vscode.workspace.getConfiguration('coop').get<boolean>('verifyOnJoin', true)) return
  if (session !== live) return

  const report = await live.verify()
  const repairable = fixable(report)
  if (repairable.length === 0 || session !== live) return

  const pick = await vscode.window.showWarningMessage(
    `"${live.coopName}": มี ${repairable.length} ไฟล์บนเครื่องคุณไม่ตรงกับ co-op`,
    'เอาฉบับ co-op มาทับ', 'ดูรายการ'
  )
  if (pick === 'เอาฉบับ co-op มาทับ') await pullFromCoop(live, repairable)
  else if (pick === 'ดูรายการ') await showReport(live, report)
}

// ------------------------------------------------------------------ your name

function defaultUserName (): string {
  return os.userInfo().username || 'someone'
}

/** Your name next to the sidebar title, so you can see it before joining anything. */
function showMyName () {
  if (!currentTree) return
  const name = session?.userName ||
    vscode.workspace.getConfiguration('coop').get<string>('userName') || defaultUserName()
  currentTree.description = `คุณ: ${name}`
}

/**
 * The name floating next to your cursor in everyone else's editor.
 *
 * Stored in settings, not in the co-op: it is who you are on this machine, so
 * it follows you into the next co-op instead of being set again each time.
 */
async function renameMe () {
  const cfg = vscode.workspace.getConfiguration('coop')
  const current = session?.userName || cfg.get<string>('userName') || defaultUserName()

  const typed = await vscode.window.showInputBox({
    title: 'ชื่อที่เพื่อนเห็นตอนอยู่ใน co-op',
    value: current,
    prompt: session
      ? 'เปลี่ยนแล้วทุกเครื่องเห็นทันที ไม่ต้องออกแล้วเข้าใหม่'
      : 'จะใช้ตอนเข้า co-op ครั้งต่อไป',
    ignoreFocusOut: true,
    validateInput: value => {
      const name = value.trim()
      if (!name) return 'ต้องมีชื่อ'
      if (name.length > 40) return 'ยาวเกินไป - ไม่เกิน 40 ตัวอักษร'
      return undefined
    }
  })
  if (typed === undefined) return

  const name = typed.trim()
  await cfg.update('userName', name, vscode.ConfigurationTarget.Global)

  // A colour picked by hand stays put; one we derived from the old name would
  // otherwise keep pointing at somebody who no longer exists.
  const color = cfg.get<string>('color') || colorFor(name)
  session?.setUserName(name, color)
  showMyName()
  currentView.refresh()

  vscode.window.showInformationMessage(
    session ? `เพื่อนจะเห็นคุณเป็น "${name}" แล้ว` : `ตั้งชื่อเป็น "${name}" แล้ว`
  )
}

const PULL_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('cloud-download'),
  tooltip: 'เอาฉบับ co-op มาทับของบนเครื่อง'
}

interface Row extends vscode.QuickPickItem {
  /** Files this row's button pulls down. */
  pull?: string[]
  run?: () => Thenable<unknown>
}

async function showReport (live: CoopSession, report: VerifyReport) {
  const rows: Row[] = []
  const separator = (label: string) => rows.push({ label, kind: vscode.QuickPickItemKind.Separator })

  const repairable = fixable(report)
  if (live.role === 'owner' && repairable.length > 0) {
    rows.push({
      label: `$(cloud-upload) ใช้ของเครื่องฉันทั้งหมด (${repairable.length} ไฟล์)`,
      description: 'ส่งไฟล์จากเครื่องคุณเข้าห้อง',
      run: async () => {
        const n = await live.adoptHostDisk(repairable)
        vscode.window.showInformationMessage(`ส่งของเครื่องคุณเข้าห้องแล้ว ${n} ไฟล์`)
      }
    })
  }
  if (repairable.length > 1) {
    rows.push({
      label: `$(cloud-download) เอาฉบับ co-op มาทับทั้งหมด (${repairable.length} ไฟล์)`,
      pull: repairable,
      run: () => pullFromCoop(live, repairable)
    })
  }

  if (report.different.length > 0) separator('เนื้อหาไม่ตรง')
  for (const key of report.different) {
    rows.push({
      label: `$(diff) ${key}`,
      description: 'กดเพื่อดูว่าต่างตรงไหน',
      buttons: [PULL_BUTTON],
      pull: [key],
      run: () => vscode.commands.executeCommand(
        'vscode.diff', sharedUri(key), keyUri(live, key), `${key} (co-op ↔ ของคุณ)`
      )
    })
  }

  if (report.missingLocal.length > 0) separator('มีใน co-op แต่ไม่มีบนเครื่องคุณ')
  for (const key of report.missingLocal) {
    rows.push({
      label: `$(question) ${key}`,
      description: 'เปิดดูฉบับของ co-op',
      buttons: [PULL_BUTTON],
      pull: [key],
      run: () => vscode.window.showTextDocument(sharedUri(key), { preview: true })
    })
  }

  if (report.notShared.length > 0) separator('มีบนเครื่องคุณ แต่ไม่ได้อยู่ใน co-op')
  for (const key of report.notShared) {
    rows.push({
      label: `$(circle-outline) ${key}`,
      description: 'เพื่อนไม่เห็นไฟล์นี้',
      run: () => vscode.window.showTextDocument(keyUri(live, key), { preview: true })
    })
  }

  if (report.unreadable.length > 0) separator('ใหญ่หรือเป็น binary เกินกว่าจะ sync')
  for (const key of report.unreadable) {
    rows.push({ label: `$(circle-slash) ${key}`, description: 'เกิน 1 MB หรือไม่ใช่ข้อความ' })
  }

  // Built by hand rather than showQuickPick, because the per-row download
  // button is the whole point and only the long form reports those.
  const picker = vscode.window.createQuickPick<Row>()
  picker.title = 'เทียบไฟล์กับ co-op'
  picker.placeholder = summarise(report)
  picker.matchOnDescription = true
  picker.items = rows

  picker.onDidTriggerItemButton(async event => {
    picker.hide()
    await pullFromCoop(live, event.item.pull ?? [])
  })
  picker.onDidAccept(async () => {
    const chosen = picker.selectedItems[0]
    picker.hide()
    await chosen?.run?.()
  })
  picker.onDidHide(() => picker.dispose())
  picker.show()
}

/**
 * Takes the co-op's copy and writes it over the local one.
 *
 * Asks first, every time. For a file nobody has open this lands straight on
 * disk, where undo cannot reach it - so the warning says exactly that instead
 * of the usual vague "are you sure".
 */
async function pullFromCoop (live: CoopSession, keys: string[]) {
  if (keys.length === 0) return
  if (session !== live) {
    vscode.window.showWarningMessage('ออกจาก co-op ไปแล้ว - ไม่ได้ดึงไฟล์')
    return
  }

  const heading = keys.length === 1
    ? `จะเขียนทับ "${keys[0]}" ด้วยฉบับที่อยู่ใน co-op`
    : `จะเขียนทับ ${keys.length} ไฟล์ ด้วยฉบับที่อยู่ใน co-op`
  const listed = keys.slice(0, 10).join('\n')
  const more = keys.length > 10 ? `\n...อีก ${keys.length - 10} ไฟล์` : ''

  const confirm = await vscode.window.showWarningMessage(
    heading,
    {
      modal: true,
      detail:
        'สิ่งที่คุณแก้ไว้ในไฟล์เหล่านี้บนเครื่องจะหาย ' +
        'ไฟล์ที่ไม่ได้เปิดค้างไว้จะกู้ด้วย undo ไม่ได้\n\n' + listed + more
    },
    'เขียนทับ'
  )
  if (confirm !== 'เขียนทับ') return
  if (session !== live) return

  const done = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ดึงฉบับ co-op ลงเครื่อง...' },
    () => live.pull(keys)
  )

  const again = await vscode.window.showInformationMessage(
    `อัปเดตจาก co-op แล้ว ${done} ไฟล์`,
    'เทียบอีกครั้ง'
  )
  if (again === 'เทียบอีกครั้ง') await verifyFiles()
}

function keyUri (live: CoopSession, key: string): vscode.Uri {
  return vscode.Uri.joinPath(live.root, ...key.split('/'))
}

function summarise (r: VerifyReport): string {
  const parts = [`ตรงกัน ${r.matched}/${r.total}`]
  if (r.different.length) parts.push(`ไม่ตรง ${r.different.length}`)
  if (r.missingLocal.length) parts.push(`ขาดบนเครื่อง ${r.missingLocal.length}`)
  if (r.notShared.length) parts.push(`ไม่ได้แชร์ ${r.notShared.length}`)
  if (r.unreadable.length) parts.push(`sync ไม่ได้ ${r.unreadable.length}`)
  return parts.join(' · ')
}

// -------------------------------------------------------------------- invites

async function copyInviteFor (invite: Invite, coopName: string, role: Role) {
  try {
    const token = await fetchRoleToken(invite, role)
    const code = encodeInvite({ ...invite, token, name: coopName })
    await vscode.env.clipboard.writeText(code)
    vscode.window.showInformationMessage(
      `คัดลอก invite (${role}) แล้ว - ส่งให้เพื่อนได้เลย`
    )
  } catch (err) {
    vscode.window.showErrorMessage(`Co-op: ${err instanceof Error ? err.message : err}`)
  }
}

/**
 * The invite for the co-op we are actually in.
 *
 * This deliberately refuses to work while disconnected. Reading the stored
 * invite instead was the reason "copy invite" kept producing a stale link:
 * leaving a co-op does not erase what is stored, so the old code happily
 * copied an invite for a co-op the person had already left.
 */
async function ownerInviteOrWarn (): Promise<Invite | undefined> {
  const folder = currentFolder()
  if (!folder) return
  if (!session) {
    vscode.window.showErrorMessage('ต้องอยู่ใน co-op ก่อน จึงจะออก invite ได้')
    return
  }
  if (session.role !== 'owner') {
    vscode.window.showErrorMessage('เฉพาะเจ้าของ co-op เท่านั้นที่ออก invite ได้')
    return
  }
  const invite = await storedInvite(folder.uri)
  if (!invite || invite.coopId !== session.coopId) {
    vscode.window.showErrorMessage('ข้อมูล co-op ในเครื่องไม่ตรงกัน - ลองออกแล้วเข้าใหม่')
    return
  }
  return invite
}

async function copyInvite () {
  const invite = await ownerInviteOrWarn()
  if (!invite) return
  const role = await pickRole('จะให้เพื่อนทำอะไรได้')
  if (!role) return
  await copyInviteFor(invite, session?.coopName ?? invite.name, role)
}

async function rotateInvite () {
  const invite = await ownerInviteOrWarn()
  if (!invite) return
  const role = await pickRole('จะยกเลิก invite ระดับไหน')
  if (!role) return

  const confirm = await vscode.window.showWarningMessage(
    `invite ระดับ ${role} อันเดิมจะใช้ไม่ได้ทันที คนที่ถืออยู่จะเข้าไม่ได้อีก`,
    { modal: true },
    'ยกเลิก invite เดิม'
  )
  if (!confirm) return

  try {
    const token = await rotateRoleToken(invite, role)
    const code = encodeInvite({ ...invite, token, name: session?.coopName ?? invite.name })
    await vscode.env.clipboard.writeText(code)
    vscode.window.showInformationMessage(`ออก invite ${role} ใหม่แล้ว และคัดลอกไว้ให้`)
  } catch (err) {
    vscode.window.showErrorMessage(`Co-op: ${err instanceof Error ? err.message : err}`)
  }
}

async function pickRole (placeHolder: string): Promise<Role | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'แก้ไขได้', description: 'editor', role: 'editor' as Role },
      { label: 'อ่านอย่างเดียว', description: 'viewer', role: 'viewer' as Role }
    ],
    { placeHolder }
  )
  return picked?.role
}
