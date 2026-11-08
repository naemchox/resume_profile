import * as vscode from 'vscode'
import { keyToUri } from './workspaceFiles'

export interface RemoteCursor {
  key: string
  anchor: number
  head: number
}

export interface RemoteUser {
  name: string
  color: string
}

const PALETTE = [
  '#f59e0b', '#22c55e', '#3b82f6', '#ec4899',
  '#a855f7', '#ef4444', '#14b8a6', '#eab308'
]

export function colorFor (name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

interface Decorations {
  caret: vscode.TextEditorDecorationType
  selection: vscode.TextEditorDecorationType
  label: vscode.TextEditorDecorationType
}

/** Draws everyone else's caret, selection and name in the editors we can see. */
export class Presence {
  private decorations = new Map<number, Decorations>()

  constructor (private root: vscode.Uri) {}

  private decorationsFor (clientId: number, user: RemoteUser): Decorations {
    let d = this.decorations.get(clientId)
    if (!d) {
      d = {
        caret: vscode.window.createTextEditorDecorationType({
          borderStyle: 'solid',
          borderWidth: '0 0 0 2px',
          borderColor: user.color,
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }),
        selection: vscode.window.createTextEditorDecorationType({
          backgroundColor: user.color + '33',
          borderRadius: '2px'
        }),
        // Rendered past the end of the line so it never pushes real code around.
        label: vscode.window.createTextEditorDecorationType({
          after: {
            color: '#ffffff',
            backgroundColor: user.color,
            margin: '0 0 0 1.5em',
            fontStyle: 'normal'
          },
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        })
      }
      this.decorations.set(clientId, d)
    }
    return d
  }

  render (peers: Map<number, { user: RemoteUser, cursor?: RemoteCursor }>) {
    // A peer that disappeared should take its decorations with it.
    for (const clientId of Array.from(this.decorations.keys())) {
      if (!peers.has(clientId)) {
        const d = this.decorations.get(clientId)!
        d.caret.dispose()
        d.selection.dispose()
        d.label.dispose()
        this.decorations.delete(clientId)
      }
    }

    for (const editor of vscode.window.visibleTextEditors) {
      for (const [clientId, peer] of peers) {
        const d = this.decorationsFor(clientId, peer.user)
        const cursor = peer.cursor
        const inThisFile =
          cursor && keyToUri(this.root, cursor.key).fsPath === editor.document.uri.fsPath

        if (!inThisFile) {
          editor.setDecorations(d.caret, [])
          editor.setDecorations(d.selection, [])
          editor.setDecorations(d.label, [])
          continue
        }

        const max = editor.document.getText().length
        const head = editor.document.positionAt(Math.min(cursor!.head, max))
        const anchor = editor.document.positionAt(Math.min(cursor!.anchor, max))

        editor.setDecorations(d.caret, [new vscode.Range(head, head)])
        editor.setDecorations(
          d.selection,
          head.isEqual(anchor) ? [] : [new vscode.Range(anchor, head)]
        )
        const lineEnd = editor.document.lineAt(head.line).range.end
        editor.setDecorations(d.label, [{
          range: new vscode.Range(lineEnd, lineEnd),
          renderOptions: { after: { contentText: ` ${peer.user.name} ` } }
        }])
      }
    }
  }

  dispose () {
    this.decorations.forEach(d => {
      d.caret.dispose()
      d.selection.dispose()
      d.label.dispose()
    })
    this.decorations.clear()
  }
}
