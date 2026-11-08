import * as path from 'path'
import * as vscode from 'vscode'

// Phase 1 keeps the sync set deliberately small and dumb. Phase 2 replaces all
// of this with a real .gitignore-aware matcher.
const SKIP_DIRS = new Set([
  'node_modules', 'out', 'dist', 'build', 'coverage',
  '__pycache__', 'venv', 'target', 'vendor'
])
const SKIP_FILES = /^(\.env.*|\.DS_Store|.*\.log)$/
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|svgz|pdf|zip|gz|tgz|mp[34]|mov|woff2?|ttf|eot|class|jar|so|dylib|dll|exe|sqlite|db)$/i
const MAX_BYTES = 1_000_000

const decoder = new TextDecoder('utf-8')
const encoder = new TextEncoder()

function skipDir (name: string) {
  return SKIP_DIRS.has(name) || name.startsWith('.')
}

function skipFile (name: string) {
  return SKIP_FILES.test(name) || BINARY_EXT.test(name)
}

/**
 * Turns a uri into the key we use inside the shared doc: a posix-style path
 * relative to the coop root. Returns null when the file does not belong to
 * the coop at all.
 */
export function relKey (root: vscode.Uri, uri: vscode.Uri): string | null {
  if (uri.scheme !== 'file') return null
  const rel = path.relative(root.fsPath, uri.fsPath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  const parts = rel.split(path.sep)
  const name = parts[parts.length - 1]
  if (parts.slice(0, -1).some(skipDir) || skipFile(name)) return null
  return parts.join('/')
}

export function keyToUri (root: vscode.Uri, key: string): vscode.Uri {
  return vscode.Uri.joinPath(root, ...key.split('/'))
}

/**
 * The relative path of anything under the root, files and folders alike,
 * without the sync rules applied. Used to match a deleted folder against the
 * keys that lived inside it.
 */
export function relPath (root: vscode.Uri, uri: vscode.Uri): string | null {
  if (uri.scheme !== 'file') return null
  const rel = path.relative(root.fsPath, uri.fsPath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

/** Every file in the folder that the coop is willing to share. Pass `under`
 *  (a key-style folder path) to scan only part of it. */
export async function scanFiles (root: vscode.Uri, under = ''): Promise<string[]> {
  const found: string[] = []
  if (under && under.split('/').some(skipDir)) return found

  async function walk (dir: vscode.Uri, prefix: string) {
    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(dir)
    } catch {
      return
    }
    for (const [name, type] of entries) {
      if (type === vscode.FileType.Directory) {
        if (skipDir(name)) continue
        await walk(vscode.Uri.joinPath(dir, name), prefix + name + '/')
      } else if (type === vscode.FileType.File) {
        if (skipFile(name)) continue
        found.push(prefix + name)
      }
    }
  }

  if (under) await walk(keyToUri(root, under), under + '/')
  else await walk(root, '')
  return found
}

/** Reads a file as text. Returns null for missing, oversized or binary files. */
export async function readText (root: vscode.Uri, key: string): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(keyToUri(root, key))
    if (bytes.byteLength > MAX_BYTES) return null
    const text = decoder.decode(bytes)
    if (text.includes('\u0000')) return null
    return text
  } catch {
    return null
  }
}

export async function writeText (root: vscode.Uri, key: string, text: string): Promise<void> {
  const uri = keyToUri(root, key)
  const parent = vscode.Uri.joinPath(uri, '..')
  try {
    await vscode.workspace.fs.createDirectory(parent)
  } catch {
    // already there
  }
  await vscode.workspace.fs.writeFile(uri, encoder.encode(text))
}

/**
 * Removes a file because the co-op removed it. Goes to the trash rather than
 * vanishing, since it was somebody else's decision and they may be wrong.
 */
export async function removeFile (root: vscode.Uri, key: string): Promise<void> {
  try {
    await vscode.workspace.fs.delete(keyToUri(root, key), { useTrash: true })
  } catch {
    try {
      await vscode.workspace.fs.delete(keyToUri(root, key), { useTrash: false })
    } catch {
      // already gone
    }
  }
}

export async function isDirectory (uri: vscode.Uri): Promise<boolean> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory
  } catch {
    return false
  }
}
