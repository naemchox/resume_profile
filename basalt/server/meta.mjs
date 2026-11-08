// Meta API: schema introspection, the SQL runner, and the policy simulator.
//
// Every route here demands a service key. None of it is reachable with a user
// JWT — resolveIdentity only yields service_role for a project's service key.
// Each call is scoped to the project that key belongs to (its `schema`), so one
// tenant's Studio can never see another's tables, policies, users, or data.

import { db, asRole, asSuperuser, refreshCatalog, invalidatePolicyCache, listTables, q } from './db.mjs';
import { connectionCount } from './realtime.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export function requireService(identity) {
  if (identity.role !== 'service_role') throw httpError(403, 'service key required');
}

export async function tables(schema = 'public') {
  await refreshCatalog();
  const rows = listTables().filter((t) => t.schema === schema);
  const counts = await asSuperuser(async (tx) => {
    const out = {};
    for (const t of rows) {
      try {
        const r = await tx.query(`select count(*)::bigint as n from ${q(t.schema)}.${q(t.name)}`);
        out[`${t.schema}.${t.name}`] = Number(r.rows[0].n);
      } catch { out[`${t.schema}.${t.name}`] = null; }
    }
    return out;
  });

  return rows.map((t) => ({
    schema: t.schema,
    name: t.name,
    rls_enabled: t.rls,
    primary_key: t.pk,
    row_count: counts[`${t.schema}.${t.name}`] ?? null,
    columns: [...t.columns.values()],
  }));
}

export async function policies(schema = 'public') {
  const { rows } = await asSuperuser((tx) =>
    tx.query(`select schemaname as schema, tablename as table, policyname as name,
                     permissive, roles, cmd, qual, with_check
                from pg_policies where schemaname = $1
               order by tablename, policyname`, [schema]),
  );
  return rows;
}

/**
 * Superuser SQL, scoped to the project's schema via a transaction-local
 * search_path so unqualified names (`create table foo`, `grant … on foo`) land
 * in the right tenant. SET LOCAL keeps it from leaking to the next request.
 */
export async function runSql(sql, schema = 'public') {
  if (typeof sql !== 'string' || !sql.trim()) throw httpError(400, 'sql required');
  const started = Date.now();
  try {
    const res = await asSuperuser(async (tx) => {
      await tx.query(`set local search_path to ${q(schema)}, public, pg_catalog`);
      return tx.exec(sql);
    });
    await refreshCatalog();       // schema may have changed under us
    invalidatePolicyCache();
    const last = res.at(-1) ?? { rows: [], fields: [] };
    return {
      rows: last.rows ?? [],
      fields: (last.fields ?? []).map((f) => f.name),
      statements: res.length,
      duration_ms: Date.now() - started,
    };
  } catch (err) {
    throw httpError(400, err.message);
  }
}

/**
 * The policy simulator — our answer to Firestore's Rules Playground.
 *
 * Runs a read-only statement under an arbitrary role and claim set, then rolls
 * back. This is how you check "would Alice see this row?" without becoming
 * Alice. The rollback is unconditional: the simulator can never mutate.
 */
export async function simulate({ sql, role = 'anon', claims = {}, schema = 'public' }) {
  if (typeof sql !== 'string' || !sql.trim()) throw httpError(400, 'sql required');
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw httpError(400, 'unknown role');

  const started = Date.now();
  try {
    const result = await asRole(role, claims, async (tx) => {
      await tx.query(`set local search_path to ${q(schema)}, public, pg_catalog`);
      const res = await tx.query(sql);
      // Force a rollback so a simulated INSERT/UPDATE can never persist.
      throw Object.assign(new Error('__simulate_rollback__'), { rows: res.rows, fields: res.fields });
    });
    return result; // unreachable
  } catch (err) {
    if (err.message === '__simulate_rollback__') {
      return {
        allowed: true,
        rows: err.rows ?? [],
        fields: (err.fields ?? []).map((f) => f.name),
        row_count: (err.rows ?? []).length,
        duration_ms: Date.now() - started,
      };
    }
    // A policy violation or a permission error is a *result*, not a crash.
    return {
      allowed: false,
      error: err.message,
      code: err.code ?? null,
      duration_ms: Date.now() - started,
    };
  }
}

export async function users(projectId = 'default', { limit = 100, offset = 0 } = {}) {
  const { rows } = await asSuperuser((tx) =>
    tx.query(
      `select id, email, role, app_metadata, user_metadata, email_confirmed_at,
              banned_until, created_at, last_sign_in_at
         from auth.users where project_id = $1 order by created_at desc limit $2 offset $3`,
      [projectId, Math.min(limit, 500), offset],
    ),
  );
  return rows;
}

export async function deleteUser(projectId, id) {
  await asSuperuser((tx) => tx.query(`delete from auth.users where id = $1 and project_id = $2`, [id, projectId]));
  return { ok: true };
}

/** Grant a role through app_metadata — the only metadata a policy should trust. */
export async function setAppMetadata(projectId, id, metadata) {
  const { rows } = await asSuperuser((tx) =>
    tx.query(`update auth.users set app_metadata = $3 where id = $1 and project_id = $2
                returning id, email, app_metadata`,
      [id, projectId, JSON.stringify(metadata)]),
  );
  if (!rows.length) throw httpError(404, 'user not found');
  return rows[0];
}

export async function enableRealtime(schema, table) {
  await asSuperuser((tx) => tx.query(`select realtime.enable($1::regclass)`, [`${schema}.${table}`]));
  return { ok: true, table: `${schema}.${table}` };
}

export async function disableRealtime(schema, table) {
  await asSuperuser((tx) => tx.query(`select realtime.disable($1::regclass)`, [`${schema}.${table}`]));
  return { ok: true, table: `${schema}.${table}` };
}

export async function realtimeTables(schema = 'public') {
  const { rows } = await asSuperuser((tx) =>
    tx.query(`select n.nspname as schema, c.relname as table
                from pg_trigger t join pg_class c on c.oid = t.tgrelid
                join pg_namespace n on n.oid = c.relnamespace
               where t.tgname = 'basalt_emit_change' and not t.tgisinternal and n.nspname = $1`, [schema]),
  );
  return rows;
}

export async function stats(schema = 'public', projectId = 'default') {
  const { rows } = await asSuperuser((tx) =>
    tx.query(`select
        (select count(*) from auth.users where project_id = $1)::int as users,
        (select count(*) from realtime.changelog where schema_name = $2)::int as changelog_size,
        (select count(*) from storage.objects where bucket_id like $3)::int as objects,
        (select coalesce(sum(size),0) from storage.objects where bucket_id like $3)::bigint as storage_bytes`,
      [projectId, schema, `${projectId}::%`]),
  );
  return { ...rows[0], storage_bytes: Number(rows[0].storage_bytes), realtime_connections: connectionCount() };
}
