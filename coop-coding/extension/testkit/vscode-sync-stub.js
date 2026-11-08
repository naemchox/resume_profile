// A fuller vscode stand-in for running two CoopSessions in plain node.
//
// Events are real emitters, so a check can fire "the user saved", "a file was
// deleted in the explorer" or "the watcher saw a change" by hand. There are no
// open editors: every file is a file on disk, which is the case that matters
// for the host's folder.
import * as fs from 'fs'
import * as nodePath from 'path'

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 }

const uri = (p) => ({ scheme: 'file', fsPath: p, path: p, toString: () => 'file://' + p })
export const Uri = {
  file: uri,
  from: ({ path }) => uri(path),
  joinPath: (base, ...segments) => uri(nodePath.join(base.fsPath ?? '', ...segments))
}

function emitter () {
  const fns = new Set()
  const event = fn => { fns.add(fn); return { dispose: () => fns.delete(fn) } }
  event.fire = (...args) => { for (const fn of [...fns]) fn(...args) }
  return event
}

export const events = {
  changeText: emitter(),
  save: emitter(),
  open: emitter(),
  create: emitter(),
  delete: emitter(),
  rename: emitter(),
  windowState: emitter(),
  /** One set per watcher, in creation order. */
  watchers: []
}

export class RelativePattern {
  constructor (base, pattern) { this.base = base; this.pattern = pattern }
}

export const workspace = {
  workspaceFolders: undefined,
  textDocuments: [],
  getConfiguration: () => ({ get: () => undefined }),
  onDidChangeTextDocument: events.changeText,
  onDidSaveTextDocument: events.save,
  onDidOpenTextDocument: events.open,
  onDidCreateFiles: events.create,
  onDidDeleteFiles: events.delete,
  onDidRenameFiles: events.rename,
  createFileSystemWatcher: (pattern) => {
    const w = {
      root: pattern.base.fsPath,
      onDidCreate: emitter(),
      onDidChange: emitter(),
      onDidDelete: emitter(),
      dispose: () => { events.watchers = events.watchers.filter(x => x !== w) }
    }
    events.watchers.push(w)
    return w
  },
  applyEdit: async () => true,
  fs: {
    readDirectory: async (dir) =>
      fs.readdirSync(dir.fsPath, { withFileTypes: true })
        .map(e => [e.name, e.isDirectory() ? FileType.Directory : FileType.File]),
    readFile: async (target) => new Uint8Array(fs.readFileSync(target.fsPath)),
    writeFile: async (target, bytes) => fs.writeFileSync(target.fsPath, bytes),
    createDirectory: async (dir) => fs.mkdirSync(dir.fsPath, { recursive: true }),
    delete: async (target) => fs.rmSync(target.fsPath, { recursive: true }),
    stat: async (target) => {
      const s = fs.statSync(target.fsPath)
      return { type: s.isDirectory() ? FileType.Directory : FileType.File, size: s.size }
    }
  }
}

const noop = () => undefined
export const window = {
  visibleTextEditors: [],
  showInformationMessage: noop,
  showWarningMessage: noop,
  showErrorMessage: noop,
  setStatusBarMessage: noop,
  createTextEditorDecorationType: () => ({ dispose: noop }),
  onDidChangeTextEditorSelection: emitter(),
  onDidChangeActiveTextEditor: emitter(),
  onDidChangeVisibleTextEditors: emitter(),
  onDidChangeWindowState: events.windowState
}

export const DecorationRangeBehavior = { ClosedClosed: 1 }
export class Range { constructor (a, b) { this.start = a; this.end = b } }
export class WorkspaceEdit { replace () {} }

export default {
  Uri, FileType, workspace, window, RelativePattern, Range, WorkspaceEdit,
  DecorationRangeBehavior, events
}
