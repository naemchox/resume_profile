// Where a joiner's copy of a co-op lands.
//
// The person who created the co-op keeps working in their own folder. Everyone
// who joins gets a copy somewhere else on purpose: syncing a co-op straight
// into a folder that already holds their own work would overwrite it, because
// on join the co-op always wins.
//
// All joined co-ops gather under one folder called "coop session", so a person
// ends up with a predictable place instead of copies scattered around.

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

export const SESSION_DIR_NAME = 'coop session'

const ROOT_KEY = 'coop.sessionsRoot'
const FOLDERS_KEY = 'coop.joinedFolders'

async function exists (uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    return stat.type === vscode.FileType.Directory
  } catch {
    return false
  }
}

/**
 * Turns a co-op name into one safe folder segment.
 *
 * The invariant that matters: the result never contains a path separator and
 * is never "." or "..", so joining it to the session root cannot climb out of
 * it no matter what the co-op was called.
 */
export function safeFolderName (name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 60)
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'co-op'
  return cleaned
}

/**
 * Finds the standing "coop session" folder: the one we were told about last
 * time, otherwise the usual places a person would have put it.
 */
export async function findSessionRoot (ctx: vscode.ExtensionContext): Promise<vscode.Uri | undefined> {
  const remembered = ctx.globalState.get<string>(ROOT_KEY)
  if (remembered) {
    const uri = vscode.Uri.file(remembered)
    if (await exists(uri)) return uri
  }

  const home = os.homedir()
  for (const base of [home, path.join(home, 'Desktop'), path.join(home, 'Documents')]) {
    const candidate = vscode.Uri.file(path.join(base, SESSION_DIR_NAME))
    if (await exists(candidate)) {
      await ctx.globalState.update(ROOT_KEY, candidate.fsPath)
      return candidate
    }
  }
  return undefined
}

/** Asks for a location and creates "coop session" inside it. */
export async function pickSessionRoot (ctx: vscode.ExtensionContext): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: `สร้าง "${SESSION_DIR_NAME}" ที่นี่`,
    title: `เลือกที่เก็บโฟลเดอร์ "${SESSION_DIR_NAME}"`
  })
  if (!picked || picked.length === 0) return undefined

  const chosen = picked[0]
  // Choosing the "coop session" folder itself should not nest another one.
  const root = path.basename(chosen.fsPath) === SESSION_DIR_NAME
    ? chosen
    : vscode.Uri.joinPath(chosen, SESSION_DIR_NAME)

  await vscode.workspace.fs.createDirectory(root)
  await ctx.globalState.update(ROOT_KEY, root.fsPath)
  return root
}

/** First name of the form "base", "base (2)", "base (3)"... that is free. */
export function nextFreeFolderName (base: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(base)) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`
    if (!isTaken(candidate)) return candidate
  }
  return `${base} (${Date.now()})`
}

async function isEmptyDir (uri: vscode.Uri): Promise<boolean> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(uri)
    return entries.length === 0
  } catch {
    return true
  }
}

/**
 * The folder this co-op lives in, under the session root.
 *
 * Rejoining the same co-op always returns the same folder. When the name is
 * already held by a *different* co-op we ask rather than silently making
 * "name (2)": creating a co-op again for the same project mints a new id, so
 * the common case is that the person wants their old folder back, not a pile
 * of near-identical copies.
 *
 * Returns undefined if they back out.
 */
export async function folderForCoop (
  ctx: vscode.ExtensionContext,
  root: vscode.Uri,
  coopId: string,
  folderName: string
): Promise<vscode.Uri | undefined> {
  const known = ctx.globalState.get<Record<string, string>>(FOLDERS_KEY) ?? {}

  // Drop bindings whose folder the person has since deleted. Without this a
  // deleted "startup" still counts as taken and the next join becomes
  // "startup (2)", then "(3)", for a folder that is not even there any more.
  let pruned = false
  for (const [id, folderPath] of Object.entries(known)) {
    if (!await exists(vscode.Uri.file(folderPath))) {
      delete known[id]
      pruned = true
    }
  }
  if (pruned) await ctx.globalState.update(FOLDERS_KEY, known)

  if (known[coopId]) {
    const uri = vscode.Uri.file(known[coopId])
    if (await exists(uri)) return uri
  }

  const base = safeFolderName(folderName)
  const takenByOthers = new Map<string, string>()
  for (const [id, folderPath] of Object.entries(known)) {
    if (id !== coopId) takenByOthers.set(path.basename(folderPath), id)
  }

  let chosenName = base
  const heldByAnother = takenByOthers.has(base)
  const onDisk = vscode.Uri.joinPath(root, base)

  if (heldByAnother || (await exists(onDisk) && !await isEmptyDir(onDisk))) {
    const reuse = `$(folder) ใช้ "${base}" เดิม`
    const fresh = `$(new-folder) สร้าง "${nextFreeFolderName(base, n => takenByOthers.has(n))}" แยกใหม่`
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: reuse,
          detail: heldByAnother
            ? 'โฟลเดอร์นี้เคยใช้กับ co-op อื่น ไฟล์ข้างในจะถูกแทนที่ด้วยของ co-op นี้'
            : 'โฟลเดอร์นี้มีไฟล์อยู่แล้ว ไฟล์ชื่อซ้ำจะถูกแทนที่ด้วยของ co-op นี้'
        },
        { label: fresh, detail: 'เก็บของเดิมไว้ ไม่แตะต้อง' }
      ],
      { placeHolder: `มีโฟลเดอร์ "${base}" อยู่แล้ว`, ignoreFocusOut: true }
    )
    if (!picked) return undefined

    if (picked.label === reuse) {
      // Hand the folder over to this co-op so we never ask about it again.
      for (const [id, folderPath] of Object.entries(known)) {
        if (id !== coopId && path.basename(folderPath) === base) delete known[id]
      }
    } else {
      chosenName = nextFreeFolderName(base, n => takenByOthers.has(n))
    }
  }

  const target = vscode.Uri.joinPath(root, chosenName)
  await vscode.workspace.fs.createDirectory(target)
  known[coopId] = target.fsPath
  await ctx.globalState.update(FOLDERS_KEY, known)
  return target
}

/**
 * Asks the joiner where this co-op should go, with the standing folder already
 * filled in. Returns the exact folder to open, or undefined if they backed out.
 */
export async function chooseJoinFolder (
  ctx: vscode.ExtensionContext,
  coopId: string,
  coopName: string,
  folderName: string
): Promise<vscode.Uri | undefined> {
  let root = await findSessionRoot(ctx)
  const target = safeFolderName(folderName)

  if (root) {
    const here = { label: `$(check) ${vscode.Uri.joinPath(root, target).fsPath}`, description: 'ที่ประจำ', pick: 'here' }
    const other = { label: '$(folder-opened) เลือกที่อื่น...', description: `ย้ายที่ประจำของ "${SESSION_DIR_NAME}"`, pick: 'other' }
    const chosen = await vscode.window.showQuickPick([here, other], {
      placeHolder: `จะวาง "${coopName}" ไว้ที่ไหน`,
      ignoreFocusOut: true
    })
    if (!chosen) return undefined
    if (chosen.pick === 'other') {
      root = await pickSessionRoot(ctx)
      if (!root) return undefined
    }
  } else {
    const go = await vscode.window.showInformationMessage(
      `ยังไม่มีโฟลเดอร์ "${SESSION_DIR_NAME}" - เลือกที่เก็บก่อน แล้ว co-op ที่ join ทั้งหมดจะไปรวมกันที่นั่น`,
      { modal: true },
      'เลือกที่เก็บ'
    )
    if (go !== 'เลือกที่เก็บ') return undefined
    root = await pickSessionRoot(ctx)
    if (!root) return undefined
  }

  return folderForCoop(ctx, root, coopId, folderName)
}

/** Forgets every folder binding and the standing session root. */
export async function forgetFolders (ctx: vscode.ExtensionContext): Promise<void> {
  await ctx.globalState.update(FOLDERS_KEY, undefined)
  await ctx.globalState.update(ROOT_KEY, undefined)
}
