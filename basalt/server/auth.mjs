// Auth service: signup, signin, refresh-token rotation, session revocation.

import { randomBytes, randomUUID } from 'node:crypto';
import { asSuperuser, getProjectById, getProjectByPublishableKey, getProjectByServiceKey } from './db.mjs';
import * as jwt from './jwt.mjs';
import * as pw from './password.mjs';

export const ACCESS_TTL = 60 * 60;             // 1 hour
export const REFRESH_TTL = 60 * 60 * 24 * 30;  // 30 days

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, code });

const newRefreshToken = () => randomBytes(48).toString('base64url');

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  app_metadata: u.app_metadata,
  user_metadata: u.user_metadata,
  created_at: u.created_at,
  last_sign_in_at: u.last_sign_in_at,
});

function accessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      // The project this token was minted for. resolveIdentity refuses to honour
      // it against any other project, so a token cannot cross the tenant boundary.
      project: user.project_id ?? 'default',
      // app_metadata is server-controlled and safe to authorize on.
      // user_metadata rides along for convenience but policies must never read it.
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      aud: 'authenticated',
    },
    ACCESS_TTL,
  );
}

/** Mint an access token plus a fresh refresh-token family. */
async function issueSession(tx, user) {
  const familyId = randomUUID();
  const refresh = newRefreshToken();
  await tx.query(
    `insert into auth.refresh_tokens (token, user_id, family_id) values ($1, $2, $3)`,
    [refresh, user.id, familyId],
  );
  return {
    access_token: accessToken(user),
    refresh_token: refresh,
    token_type: 'bearer',
    expires_in: ACCESS_TTL,
    user: publicUser(user),
  };
}

// Users are per-project. `projectId` is resolved from the request key by the
// caller (index.mjs), so an account created through project A's key belongs to
// A and cannot sign in through project B.
export async function signup(projectId, { email, password, user_metadata = {} }) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'invalid email', 'invalid_email');
  if (!password || password.length < 8) throw httpError(400, 'password must be at least 8 characters', 'weak_password');

  const passwordHash = await pw.hash(password);

  return asSuperuser(async (tx) => {
    const existing = await tx.query(
      `select 1 from auth.users where project_id = $1 and email = $2`, [projectId, email.toLowerCase()]);
    if (existing.rows.length) throw httpError(400, 'user already registered', 'user_exists');

    const { rows } = await tx.query(
      `insert into auth.users (project_id, email, password_hash, user_metadata, email_confirmed_at, last_sign_in_at)
       values ($1, $2, $3, $4, now(), now()) returning *`,
      [projectId, email.toLowerCase(), passwordHash, JSON.stringify(user_metadata)],
    );
    return issueSession(tx, rows[0]);
  });
}

export async function signin(projectId, { email, password }) {
  const { rows } = await asSuperuser((tx) =>
    tx.query(`select * from auth.users where project_id = $1 and email = $2`,
      [projectId, String(email || '').toLowerCase()]),
  );
  const user = rows[0];

  // Equalize timing between "no such user" and "wrong password".
  if (!user) {
    await pw.fakeVerify();
    throw httpError(400, 'invalid login credentials', 'invalid_credentials');
  }
  if (!(await pw.verify(password, user.password_hash))) {
    throw httpError(400, 'invalid login credentials', 'invalid_credentials');
  }
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    throw httpError(403, 'user is banned', 'user_banned');
  }

  return asSuperuser(async (tx) => {
    await tx.query(`update auth.users set last_sign_in_at = now() where id = $1`, [user.id]);
    return issueSession(tx, { ...user, last_sign_in_at: new Date() });
  });
}

/**
 * Rotate a refresh token.
 *
 * Refresh tokens are single-use and grouped into a family. Presenting a token
 * that has already been redeemed means two parties hold it — the legitimate
 * client and a thief — and we cannot tell which is calling. So we revoke the
 * entire family and force a fresh sign-in. fundamental.md §5.2.
 *
 * The whole check-and-rotate runs in one transaction: two concurrent refreshes
 * of the same token cannot both observe `used = false`.
 */
export async function refresh(token) {
  if (!token) throw httpError(400, 'refresh_token required', 'invalid_request');

  // Inspect and rotate atomically. Note this returns an *outcome* rather than
  // throwing on reuse: throwing here would roll the transaction back, and the
  // revoke has to survive. See below.
  const outcome = await asSuperuser(async (tx) => {
    const { rows } = await tx.query(`select * from auth.refresh_tokens where token = $1 for update`, [token]);
    const row = rows[0];
    if (!row) return { kind: 'unknown' };
    if (row.revoked) return { kind: 'revoked' };
    if (row.used) return { kind: 'reused', familyId: row.family_id };

    await tx.query(`update auth.refresh_tokens set used = true where id = $1`, [row.id]);

    const u = await tx.query(`select * from auth.users where id = $1`, [row.user_id]);
    const user = u.rows[0];
    if (!user) return { kind: 'no_user' };

    // New token, same family: rotation preserves the lineage so a later reuse
    // of any ancestor still burns the whole chain.
    const next = newRefreshToken();
    await tx.query(
      `insert into auth.refresh_tokens (token, user_id, family_id) values ($1, $2, $3)`,
      [next, user.id, row.family_id],
    );
    return { kind: 'ok', user, next };
  });

  switch (outcome.kind) {
    case 'ok':
      return {
        access_token: accessToken(outcome.user),
        refresh_token: outcome.next,
        token_type: 'bearer',
        expires_in: ACCESS_TTL,
        user: publicUser(outcome.user),
      };

    case 'reused': {
      // Reuse detected: two parties hold this token and we cannot tell which is
      // calling. Burn the family.
      //
      // This MUST run in its own committed transaction. Revoking inside the
      // transaction above and then throwing would roll the revoke back — the
      // caller would still see a 401, so the bug is invisible from the outside,
      // while the stolen token stays live. That is the whole control, defeated.
      await asSuperuser((tx) =>
        tx.query(`update auth.refresh_tokens set revoked = true where family_id = $1`, [outcome.familyId]),
      );
      throw httpError(401, 'refresh token reuse detected; session revoked', 'refresh_token_reused');
    }

    case 'revoked':  throw httpError(401, 'refresh token revoked', 'invalid_refresh_token');
    case 'no_user':  throw httpError(401, 'user no longer exists', 'user_not_found');
    default:         throw httpError(401, 'invalid refresh token', 'invalid_refresh_token');
  }
}

/** Revoke one session (`scope: 'local'`) or every session for the user (`'global'`). */
export async function logout(token, scope = 'local') {
  return asSuperuser(async (tx) => {
    const { rows } = await tx.query(`select * from auth.refresh_tokens where token = $1`, [token]);
    if (!rows[0]) return { ok: true };
    if (scope === 'global') {
      await tx.query(`update auth.refresh_tokens set revoked = true where user_id = $1`, [rows[0].user_id]);
    } else {
      await tx.query(`update auth.refresh_tokens set revoked = true where family_id = $1`, [rows[0].family_id]);
    }
    return { ok: true };
  });
}

export async function getUser(userId) {
  const { rows } = await asSuperuser((tx) => tx.query(`select * from auth.users where id = $1`, [userId]));
  if (!rows[0]) throw httpError(404, 'user not found', 'user_not_found');
  return publicUser(rows[0]);
}

export async function updateUser(userId, { user_metadata, password }) {
  const sets = [];
  const args = [userId];
  if (user_metadata) { args.push(JSON.stringify(user_metadata)); sets.push(`user_metadata = $${args.length}`); }
  if (password) {
    if (password.length < 8) throw httpError(400, 'password must be at least 8 characters', 'weak_password');
    args.push(await pw.hash(password)); sets.push(`password_hash = $${args.length}`);
  }
  if (!sets.length) return getUser(userId);

  const { rows } = await asSuperuser((tx) =>
    tx.query(`update auth.users set ${sets.join(', ')} where id = $1 returning *`, args),
  );
  return publicUser(rows[0]);
}

/**
 * Resolve which PROJECT a request is addressing, from the key it presents.
 * Returns { project, viaServiceKey }, or throws 401 for a bad key.
 *
 *   - apikey === some project's service key   → that project (server-side power)
 *   - apikey === some project's publishable key → that project (client entry)
 *   - apikey looks like a key (pk_/sk_) but matches nothing → 401
 *   - no/other apikey → the default project (keyless dev + backward compat)
 */
export function resolveProject(req) {
  const apikey = req.headers['apikey'] || '';
  const bearer = (req.headers['authorization'] || '').startsWith('Bearer ')
    ? req.headers['authorization'].slice(7).trim() : '';

  // A service key may arrive in either slot; publishable keys only as apikey.
  for (const k of [apikey, bearer]) {
    const bySk = k && getProjectByServiceKey(k);
    if (bySk) return { project: bySk, viaServiceKey: true };
  }
  const byPk = apikey && getProjectByPublishableKey(apikey);
  if (byPk) return { project: byPk, viaServiceKey: false };

  if (/^(pk|sk)_/.test(apikey)) {
    throw httpError(401, 'invalid API key', 'invalid_api_key');
  }
  // Keyless / unknown → the default project (seeded at boot).
  const dflt = getProjectById('default');
  if (!dflt) throw httpError(500, 'no default project', 'no_default');
  return { project: dflt, viaServiceKey: false };
}

/**
 * Resolve a request into a full identity, scoped to its project.
 * The single chokepoint where a key/token becomes a role AND a schema.
 *
 * Returns { role, claims, userId, projectId, schema }.
 *
 * A bearer token is honoured only against the project it was minted for: its
 * `project` claim must match the project the request key resolved to. This is
 * the tenant boundary — a token from project A is rejected by project B.
 */
export function resolveIdentity(req) {
  const { project, viaServiceKey } = resolveProject(req);
  const bearer = (req.headers['authorization'] || '').startsWith('Bearer ')
    ? req.headers['authorization'].slice(7).trim() : '';

  const base = { projectId: project.id, schema: project.schema };

  // Service key → full power within its own project.
  if (viaServiceKey) {
    return { ...base, role: 'service_role', claims: { role: 'service_role' }, userId: null };
  }

  // No token → anon within the resolved project.
  if (!bearer) {
    return { ...base, role: 'anon', claims: { role: 'anon' }, userId: null };
  }

  const claims = jwt.verify(bearer); // throws 401 on bad signature / expiry
  // The token must belong to THIS project. Missing claim = 'default' for tokens
  // minted before projects existed.
  const tokenProject = claims.project ?? 'default';
  if (tokenProject !== project.id) {
    throw httpError(401, 'token does not belong to this project', 'wrong_project');
  }
  const role = claims.role === 'authenticated' ? 'authenticated' : 'anon';
  return { ...base, role, claims: { ...claims, role }, userId: claims.sub ?? null };
}
