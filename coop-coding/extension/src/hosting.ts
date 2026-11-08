// Setting up your own server.
//
// The published extension ships with no server address on purpose: a default
// pointing at one person's Cloudflare account would make them the unwitting
// host - and the data controller - for every stranger who installs it.
//
// Instead each host connects their own Cloudflare account. We drive Wrangler,
// Cloudflare's own CLI, so the authorise page the user sees is Cloudflare's
// real one and no OAuth credentials ever ship inside the extension.
//
// Only the person creating a co-op needs this. Friends who are handed an
// invite need no account and no setup at all.

import { execFile } from 'child_process'
import * as vscode from 'vscode'

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const WRANGLER = 'wrangler@4'
const WORKER_NAME = 'coop-coding-server'

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function run (args: string[], cwd?: string, timeoutMs = 180_000): Promise<RunResult> {
  return new Promise(resolve => {
    execFile(NPX, args, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        code: err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? ''
      })
    })
  })
}

async function hasNode (): Promise<boolean> {
  const res = await run(['--version'], undefined, 20_000)
  return res.code === 0 || res.stdout.length > 0
}

async function loggedIn (): Promise<boolean> {
  const res = await run([WRANGLER, 'whoami'], undefined, 120_000)
  return /You are logged in/i.test(res.stdout + res.stderr)
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The folder we assemble a deployable worker in. Lives in extension storage. */
async function deployDir (ctx: vscode.ExtensionContext): Promise<vscode.Uri> {
  const dir = vscode.Uri.joinPath(ctx.globalStorageUri, 'server')
  await vscode.workspace.fs.createDirectory(dir)

  const bundled = vscode.Uri.joinPath(ctx.extensionUri, 'out', 'worker', 'worker.js')
  const worker = await vscode.workspace.fs.readFile(bundled)
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, 'worker.js'), worker)

  const config = {
    name: WORKER_NAME,
    main: 'worker.js',
    compatibility_date: '2025-09-01',
    durable_objects: {
      bindings: [
        { name: 'COOP', class_name: 'Coop' },
        { name: 'LIMITER', class_name: 'Limiter' }
      ]
    },
    // SQLite-backed objects are the only kind the Cloudflare free plan allows.
    migrations: [
      { tag: 'v1', new_sqlite_classes: ['Coop'] },
      { tag: 'v2', new_sqlite_classes: ['Limiter'] }
    ]
  }
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(dir, 'wrangler.json'),
    new TextEncoder().encode(JSON.stringify(config, null, 2))
  )
  return dir
}

function findWorkersUrl (output: string): string | undefined {
  const match = output.match(/https:\/\/[a-z0-9._-]+\.workers\.dev/i)
  return match?.[0]
}

/** Waits for the freshly created workers.dev name to start resolving. */
async function waitForLive (httpUrl: string, attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(httpUrl, { method: 'GET' })
      if (res.ok) return true
    } catch {
      // DNS for a new workers.dev subdomain takes a few minutes
    }
    await wait(6000)
  }
  return false
}

export function currentServer (): string {
  return (vscode.workspace.getConfiguration('coop').get<string>('serverUrl') || '').trim()
}

export async function setupServer (ctx: vscode.ExtensionContext): Promise<string | undefined> {
  if (!await hasNode()) {
    const go = await vscode.window.showErrorMessage(
      'ต้องมี Node.js บนเครื่องก่อน จึงจะตั้งเซิร์ฟเวอร์ของตัวเองได้',
      'เปิดหน้าดาวน์โหลด'
    )
    if (go) vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org/'))
    return undefined
  }

  const proceed = await vscode.window.showInformationMessage(
    'จะตั้งเซิร์ฟเวอร์ co-op บนบัญชี Cloudflare ของคุณเอง — ฟรี และข้อมูลอยู่ในบัญชีคุณ ไม่ผ่านใคร\n\n' +
    'เดี๋ยวจะเปิดหน้าให้เข้าสู่ระบบ Cloudflare และกดอนุญาต',
    { modal: true },
    'เริ่มเลย'
  )
  if (proceed !== 'เริ่มเลย') return undefined

  return await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'ตั้งเซิร์ฟเวอร์ co-op',
    cancellable: true
  }, async (progress, token) => {
    progress.report({ message: 'กำลังตรวจบัญชี Cloudflare...' })

    if (!await loggedIn()) {
      if (token.isCancellationRequested) return undefined

      // Run the login in a visible terminal: it prints the authorise URL, so if
      // the browser does not open by itself the user can still get there.
      const term = vscode.window.createTerminal({ name: 'Cloudflare login' })
      term.show(true)
      term.sendText(`${NPX} ${WRANGLER} login`)

      progress.report({ message: 'รอคุณกดอนุญาตในเบราว์เซอร์...' })
      let ok = false
      for (let i = 0; i < 60; i++) {
        if (token.isCancellationRequested) return undefined
        await wait(3000)
        if (await loggedIn()) { ok = true; break }
      }
      if (!ok) {
        vscode.window.showErrorMessage('ยังไม่ได้เชื่อมบัญชี Cloudflare - ลองใหม่อีกครั้งได้')
        return undefined
      }
      term.dispose()
    }

    if (token.isCancellationRequested) return undefined
    progress.report({ message: 'กำลังส่งเซิร์ฟเวอร์ขึ้นบัญชีของคุณ...' })

    const dir = await deployDir(ctx)
    const deployed = await run([WRANGLER, 'deploy'], dir.fsPath, 300_000)
    const output = deployed.stdout + '\n' + deployed.stderr
    const url = findWorkersUrl(output)

    if (deployed.code !== 0 || !url) {
      const detail = output.trim().split('\n').slice(-6).join('\n')
      const act = await vscode.window.showErrorMessage(
        'ส่งเซิร์ฟเวอร์ขึ้นไม่สำเร็จ',
        { modal: true, detail },
        'เปิดหน้า Cloudflare'
      )
      if (act) vscode.env.openExternal(vscode.Uri.parse('https://dash.cloudflare.com/'))
      return undefined
    }

    const wsUrl = url.replace(/^https:/, 'wss:')
    await vscode.workspace.getConfiguration('coop')
      .update('serverUrl', wsUrl, vscode.ConfigurationTarget.Global)

    progress.report({ message: 'รอที่อยู่เริ่มใช้งานได้...' })
    const live = await waitForLive(url)

    if (!live) {
      vscode.window.showWarningMessage(
        `ส่งขึ้นเรียบร้อยแล้วที่ ${wsUrl} แต่ที่อยู่ยังไม่ตอบ — ` +
        'ที่อยู่ใหม่ของ workers.dev ใช้เวลา DNS สักพัก ลองสร้าง co-op อีกทีในอีกสองสามนาที'
      )
    } else {
      vscode.window.showInformationMessage(`เซิร์ฟเวอร์ของคุณพร้อมแล้ว: ${wsUrl}`)
    }
    return wsUrl
  })
}

/**
 * Returns a usable server address, offering to set one up when there is none.
 * Everything that needs a server goes through here.
 */
export async function requireServer (ctx: vscode.ExtensionContext): Promise<string | undefined> {
  const existing = currentServer()
  if (existing) return existing

  const pick = await vscode.window.showInformationMessage(
    'ยังไม่มีเซิร์ฟเวอร์สำหรับสร้าง co-op — ตั้งบนบัญชี Cloudflare ของคุณเองได้ฟรี',
    'ตั้งให้เลย', 'ใส่ที่อยู่เอง'
  )
  if (pick === 'ตั้งให้เลย') return await setupServer(ctx)
  if (pick === 'ใส่ที่อยู่เอง') {
    const typed = await vscode.window.showInputBox({
      prompt: 'ที่อยู่เซิร์ฟเวอร์ co-op',
      placeHolder: 'wss://your-server.workers.dev',
      ignoreFocusOut: true,
      validateInput: v => /^wss?:\/\/.+/.test(v.trim()) ? undefined : 'ต้องขึ้นต้นด้วย ws:// หรือ wss://'
    })
    if (!typed) return undefined
    const clean = typed.trim()
    await vscode.workspace.getConfiguration('coop')
      .update('serverUrl', clean, vscode.ConfigurationTarget.Global)
    return clean
  }
  return undefined
}
