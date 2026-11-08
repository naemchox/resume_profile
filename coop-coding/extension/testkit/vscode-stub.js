// Just enough of the vscode module to import pure helpers in plain node.
//
// workspace.fs is backed by the real filesystem so checks that walk a folder
// (scanFiles, readText) exercise the same code the extension runs.
import * as fs from 'fs'
import * as nodePath from 'path'

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 }

const uri = (p) => ({ scheme: 'file', fsPath: p, path: p })
export const Uri = {
  file: uri,
  from: ({ path }) => uri(path),
  joinPath: (base, ...segments) => uri(nodePath.join(base.fsPath ?? '', ...segments))
}

export const workspace = {
  workspaceFolders: undefined,
  textDocuments: [],
  getConfiguration: () => ({ get: () => undefined }),
  fs: {
    readDirectory: async (dir) =>
      fs.readdirSync(dir.fsPath, { withFileTypes: true })
        .map(e => [e.name, e.isDirectory() ? FileType.Directory : FileType.File]),
    readFile: async (target) => new Uint8Array(fs.readFileSync(target.fsPath)),
    writeFile: async (target, bytes) => fs.writeFileSync(target.fsPath, bytes),
    createDirectory: async (dir) => fs.mkdirSync(dir.fsPath, { recursive: true }),
    stat: async (target) => {
      const s = fs.statSync(target.fsPath)
      return { type: s.isDirectory() ? FileType.Directory : FileType.File, size: s.size }
    }
  }
}

const noop = () => undefined
export const window = {
  showInformationMessage: noop,
  showWarningMessage: noop,
  showErrorMessage: noop,
  setStatusBarMessage: noop
}

export default { Uri, FileType, workspace, window }
