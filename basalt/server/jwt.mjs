// JWT signing and verification, ES256.
//
// fundamental.md §5.2: "Asymmetric signing (ES256/RS256) so the API layer
// verifies with a public key and never holds the private key." Only the auth
// service touches the private key; everything downstream verifies with the
// public key, which is served openly at /auth/v1/jwks.

import { createSign, createVerify, generateKeyPairSync, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (str) =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let privateKey = null;
let publicKey = null;

export async function loadKeys(dir) {
  await mkdir(dir, { recursive: true });
  const privPath = join(dir, 'jwt-private.pem');
  const pubPath = join(dir, 'jwt-public.pem');

  if (existsSync(privPath) && existsSync(pubPath)) {
    privateKey = createPrivateKey(await readFile(privPath, 'utf8'));
    publicKey = createPublicKey(await readFile(pubPath, 'utf8'));
    return;
  }

  const kp = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  await writeFile(privPath, kp.privateKey, { mode: 0o600 });
  await writeFile(pubPath, kp.publicKey);
  privateKey = createPrivateKey(kp.privateKey);
  publicKey = createPublicKey(kp.publicKey);
}

export function publicKeyPem() {
  return publicKey.export({ type: 'spki', format: 'pem' });
}

/** @param {object} claims @param {number} ttlSeconds */
export function sign(claims, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = { ...claims, iat: now, exp: now + ttlSeconds };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // dsaEncoding ieee-p1363 produces the raw r||s form that JWS requires.
  const sig = cryptoSign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(sig)}`;
}

/**
 * Verify signature and expiry. Returns claims, or throws.
 *
 * The algorithm is pinned to ES256 rather than read from the header. Trusting
 * the header's `alg` is the classic JWT vulnerability: a token claiming
 * {"alg":"none"} or an HS256 token signed with the *public* key as the HMAC
 * secret would otherwise verify.
 */
export function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw Object.assign(new Error('malformed token'), { status: 401 });
  const [h, p, s] = parts;

  let header;
  try { header = JSON.parse(b64urlDecode(h).toString()); }
  catch { throw Object.assign(new Error('malformed token header'), { status: 401 }); }
  if (header.alg !== 'ES256') throw Object.assign(new Error('unsupported alg'), { status: 401 });

  const ok = cryptoVerify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    b64urlDecode(s),
  );
  if (!ok) throw Object.assign(new Error('bad signature'), { status: 401 });

  let claims;
  try { claims = JSON.parse(b64urlDecode(p).toString()); }
  catch { throw Object.assign(new Error('malformed token payload'), { status: 401 }); }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < now) {
    throw Object.assign(new Error('token expired'), { status: 401 });
  }
  return claims;
}
