#!/usr/bin/env node
// Prints a fingerprint of the files a co-op actually syncs.
//
// Two people in the same co-op run this on their own folder and compare the
// one line it prints. Same line means every synced file matches byte for byte.
//
//   node coop-fingerprint.mjs [folder]          one-line fingerprint
//   node coop-fingerprint.mjs [folder] --list   one line per file, for diffing
//
// The skip rules below are copied from extension/src/workspaceFiles.ts. They
// must stay in step with it, otherwise the two sides compare different sets.

import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import * as path from 'path'

const SKIP_DIRS = new Set([
  'node_modules', 'out', 'dist', 'build', 'coverage',
  '__pycache__', 'venv', 'target', 'vendor'
])
const SKIP_FILES = /^(\.env.*|\.DS_Store|.*\.log)$/
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|svgz|pdf|zip|gz|tgz|mp[34]|mov|woff2?|ttf|eot|class|jar|so|dylib|dll|exe|sqlite|db)$/i
const MAX_BYTES = 1_000_000

const skipDir = name => SKIP_DIRS.has(name) || name.startsWith('.')
const skipFile = name => SKIP_FILES.test(name) || BINARY_EXT.test(name)

async function scan (dir, prefix, out) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (skipDir(e.name)) continue
      await scan(path.join(dir, e.name), prefix + e.name + '/', out)
    } else if (e.isFile()) {
      if (skipFile(e.name)) continue
      out.push(prefix + e.name)
    }
  }
}

/** Mirrors readText(): oversized and NUL-bearing files never reach the co-op. */
async function syncedText (root, key) {
  const bytes = await readFile(path.join(root, ...key.split('/')))
  if (bytes.byteLength > MAX_BYTES) return null
  const text = bytes.toString('utf8')
  if (text.includes('\u0000')) return null
  return text
}

const sha = s => createHash('sha256').update(s, 'utf8').digest('hex')

const args = process.argv.slice(2)
const list = args.includes('--list')
const root = path.resolve(args.find(a => !a.startsWith('--')) ?? '.')

const keys = []
await scan(root, '', keys)
keys.sort()

const rows = []
for (const key of keys) {
  let text
  try {
    text = await syncedText(root, key)
  } catch {
    continue
  }
  if (text === null) continue
  rows.push([key, sha(text)])
}

if (list) {
  for (const [key, hash] of rows) console.log(`${hash.slice(0, 12)}  ${key}`)
  console.log(`--- ${rows.length} files`)
} else {
  const overall = sha(rows.map(([k, h]) => `${k}\n${h}`).join('\n'))
  console.log(`${rows.length} files   ${overall.slice(0, 16)}`)
  console.log(root)
}
