// Password hashing.
//
// pgcrypto is unavailable in PGlite, so bcrypt-in-the-database is not an option.
// Node's built-in scrypt is memory-hard and requires no dependency, which is a
// better answer than pulling in a native bcrypt binding anyway.

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// N=2^15 is roughly 100ms on a modern laptop. cost/blockSize/parallelism are
// stored alongside the hash so these can be raised later without invalidating
// existing passwords.
const PARAMS = { N: 32768, r: 8, p: 1, keylen: 64 };

// OpenSSL requires maxmem to be strictly greater than 128*N*r, not equal to it.
const maxmemFor = (N, r) => 256 * N * r;

export async function hash(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, PARAMS.keylen, { ...PARAMS, maxmem: maxmemFor(PARAMS.N, PARAMS.r) });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verify(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, saltB64, keyB64] = parts;
  const opts = { N: +N, r: +r, p: +p, maxmem: maxmemFor(+N, +r) };
  const expected = Buffer.from(keyB64, 'base64');

  let actual;
  try {
    actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, opts);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Burn roughly one hash's worth of time on a nonexistent user, so that
 * "unknown email" and "wrong password" are indistinguishable by timing.
 * Without this, sign-in is a user-enumeration oracle.
 */
const DUMMY = await hash(randomBytes(16).toString('hex'));
export async function fakeVerify() {
  await verify('not-the-password', DUMMY);
}
