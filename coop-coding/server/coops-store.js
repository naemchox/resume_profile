// Coop metadata: who exists, and which token grants which role.
// This has to survive a coop going offline - otherwise every invite you
// handed out would stop working the moment everyone left, which defeats the
// whole point of a coop.

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const FILE = path.join(DIR, 'coops.json')

export const ROLES = ['owner', 'editor', 'viewer']

/** @type {Record<string, {name: string, created: string, tokens: Record<string,string>}>} */
let coops = {}

function load () {
  try {
    coops = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    coops = {}
  }
}

function save () {
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(coops, null, 2))
  fs.renameSync(tmp, FILE) // atomic, so a crash mid-write cannot corrupt it
}

load()

const id = bytes => crypto.randomBytes(bytes).toString('base64url')

export function createCoop (name) {
  const coopId = id(8)
  const tokens = {}
  const issued = {}
  for (const role of ROLES) {
    const token = id(18)
    tokens[token] = role
    issued[role] = token
  }
  coops[coopId] = { name: name || 'coop', created: new Date().toISOString(), tokens }
  save()
  return { coopId, name: coops[coopId].name, tokens: issued }
}

export function getCoop (coopId) {
  return coops[coopId]
}

/** Returns the role this token grants, or null. */
export function roleFor (coopId, token) {
  const coop = coops[coopId]
  if (!coop || !token) return null
  return coop.tokens[token] ?? null
}

/** Replaces the token for one role, so a leaked invite can be killed. */
export function rotateToken (coopId, role) {
  const coop = coops[coopId]
  if (!coop || !ROLES.includes(role)) return null
  for (const [token, r] of Object.entries(coop.tokens)) {
    if (r === role) delete coop.tokens[token]
  }
  const token = id(18)
  coop.tokens[token] = role
  save()
  return token
}

export function tokenForRole (coopId, role) {
  const coop = coops[coopId]
  if (!coop) return null
  return Object.entries(coop.tokens).find(([, r]) => r === role)?.[0] ?? null
}

export function count () {
  return Object.keys(coops).length
}
