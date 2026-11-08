// Database core: PGlite lifecycle, role-scoped transactions, catalog introspection.
//
// Every request that carries user identity MUST go through `asRole`. That is the
// only place the JWT is turned into a database identity, and it is the only
// place RLS is engaged. Nothing else in this codebase may open a transaction
// against user data.

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export let db = null;

/** Identifier quoting. Only ever applied to names already validated against the catalog. */
export const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

export async function init({ dataDir = null } = {}) {
  db = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  const sql = await readFile(join(ROOT, 'sql', 'bootstrap.sql'), 'utf8');
  await db.exec(sql);
  await refreshCatalog();
  await refreshProjects();
  return db;
}

/**
 * Run `fn` inside a transaction scoped to a database role, with the JWT claims
 * exposed to auth.uid() / auth.jwt() via a transaction-local GUC.
 *
 * `SET LOCAL` and `set_config(..., true)` are both transaction-scoped, so the
 * role and the claims are unwound on COMMIT *and* on ROLLBACK. A thrown error
 * cannot leak identity into the next request. (Verified: see test/rls.test.mjs.)
 *
 * PGlite runs a single backend and serializes transactions, so there is no
 * interleaving to worry about here. A pooled Postgres deployment would need the
 * same guarantee via a dedicated connection per transaction.
 */
export async function asRole(role, claims, fn, { isolation } = {}) {
  if (role !== 'anon' && role !== 'authenticated' && role !== 'service_role') {
    throw new Error(`refusing to assume unknown role: ${role}`);
  }
  return db.transaction(async (tx) => {
    // SET TRANSACTION must precede any query in the transaction, so it goes
    // first — before the role switch and before set_config (which is a SELECT).
    if (isolation) await tx.exec(`set transaction isolation level ${isolation}`);
    await tx.exec(`set local role ${q(role)}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(claims ?? {}),
    ]);
    return fn(tx);
  });
}

/** Trusted path. BYPASSRLS. Never reachable from a client-supplied token. */
export async function asService(fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role "service_role"`);
    return fn(tx);
  });
}

/** Superuser, outside the role system. Migrations and the changelog reader only. */
export async function asSuperuser(fn) {
  return db.transaction(fn);
}

// -----------------------------------------------------------------------------
// Projects registry (cache)
// -----------------------------------------------------------------------------
// Every request is routed to a project by the key it presents. This is a hot
// path, so the registry is cached in memory and refreshed only when a project is
// created or removed — a synchronous key→project lookup, no per-request query.

let projectsById = new Map();
let projectByPk = new Map();
let projectBySk = new Map();

export async function refreshProjects() {
  const { rows } = await db.query(`select id, name, schema_name, publishable_key, service_key, created_at from basalt.projects`);
  projectsById = new Map();
  projectByPk = new Map();
  projectBySk = new Map();
  for (const r of rows) {
    const p = { id: r.id, name: r.name, schema: r.schema_name, publishableKey: r.publishable_key, serviceKey: r.service_key, createdAt: r.created_at };
    projectsById.set(p.id, p);
    projectByPk.set(p.publishableKey, p);
    projectBySk.set(p.serviceKey, p);
  }
  return rows.length;
}

export const getProjectById = (id) => projectsById.get(id) ?? null;
export const getProjectByPublishableKey = (k) => projectByPk.get(k) ?? null;
export const getProjectByServiceKey = (k) => projectBySk.get(k) ?? null;
export const listProjects = () => [...projectsById.values()];

// -----------------------------------------------------------------------------
// Catalog
// -----------------------------------------------------------------------------
// The REST layer must never interpolate a client-supplied identifier into SQL.
// Instead it looks the identifier up here; if it is absent, the request is
// rejected. This cache is the allowlist.

let catalog = { tables: new Map(), fks: [], policies: new Map() };

export async function refreshCatalog() {
  const tables = await db.query(`
    select c.relname   as table_name,
           n.nspname   as schema_name,
           c.relrowsecurity as rls_enabled,
           a.attname   as column_name,
           format_type(a.atttypid, a.atttypmod) as data_type,
           a.attnotnull as not_null,
           coalesce(i.indisprimary, false) as is_pk
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_index i on i.indrelid = c.oid and a.attnum = any(i.indkey) and i.indisprimary
    where c.relkind in ('r','v','m','p')
      and (n.nspname in ('public','storage') or n.nspname like 'proj\\_%')
    order by n.nspname, c.relname, a.attnum
  `);

  const t = new Map();
  for (const r of tables.rows) {
    const key = `${r.schema_name}.${r.table_name}`;
    if (!t.has(key)) {
      t.set(key, {
        schema: r.schema_name,
        name: r.table_name,
        rls: r.rls_enabled,
        columns: new Map(),
        pk: [],
      });
    }
    const tbl = t.get(key);
    tbl.columns.set(r.column_name, { name: r.column_name, type: r.data_type, notNull: r.not_null });
    if (r.is_pk) tbl.pk.push(r.column_name);
  }

  // Foreign keys drive embedded-resource resolution in the REST layer.
  const fks = await db.query(`
    select
      con.conname as name,
      sn.nspname as src_schema, sc.relname as src_table,
      tn.nspname as tgt_schema, tc.relname as tgt_table,
      (select array_agg(att.attname order by u.ord)
         from unnest(con.conkey) with ordinality u(attnum, ord)
         join pg_attribute att on att.attrelid = sc.oid and att.attnum = u.attnum) as src_cols,
      (select array_agg(att.attname order by u.ord)
         from unnest(con.confkey) with ordinality u(attnum, ord)
         join pg_attribute att on att.attrelid = tc.oid and att.attnum = u.attnum) as tgt_cols
    from pg_constraint con
    join pg_class sc on sc.oid = con.conrelid
    join pg_namespace sn on sn.oid = sc.relnamespace
    join pg_class tc on tc.oid = con.confrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
    where con.contype = 'f'
      and (sn.nspname in ('public','storage') or sn.nspname like 'proj\\_%')
  `);

  catalog = { tables: t, fks: fks.rows, policies: new Map() };
  return catalog;
}

export function getTable(schema, name) {
  return catalog.tables.get(`${schema}.${name}`) ?? null;
}

export function listTables() {
  return [...catalog.tables.values()];
}

/** Validate a column exists on a table. Throws rather than returning false — callers must not forget. */
export function assertColumn(tbl, col) {
  if (!tbl.columns.has(col)) {
    const e = new Error(`unknown column "${col}" on ${tbl.schema}.${tbl.name}`);
    e.status = 400;
    throw e;
  }
  return col;
}

/**
 * Find the FK relationship between two tables, in either direction.
 *  - 'to-one'  : base holds the FK (base.customer_id -> customers.id)
 *  - 'to-many' : target holds the FK (orders.user_id -> base.id)
 */
export function findRelation(base, target) {
  for (const fk of catalog.fks) {
    if (fk.src_schema === base.schema && fk.src_table === base.name &&
        fk.tgt_schema === target.schema && fk.tgt_table === target.name) {
      return { kind: 'to-one', localCols: fk.src_cols, remoteCols: fk.tgt_cols };
    }
  }
  for (const fk of catalog.fks) {
    if (fk.src_schema === target.schema && fk.src_table === target.name &&
        fk.tgt_schema === base.schema && fk.tgt_table === base.name) {
      return { kind: 'to-many', localCols: fk.tgt_cols, remoteCols: fk.src_cols };
    }
  }
  return null;
}

/**
 * Reconstruct the effective SELECT predicate for a role, as SQL text.
 *
 * This is what lets the realtime layer authorize a row that no longer exists.
 * Rather than re-selecting a DELETEd row (impossible) we evaluate the policy's
 * own USING expression against a synthetic record built from the changelog
 * payload. Same predicate, same claims, same answer — for INSERT, UPDATE and
 * DELETE alike, with no REPLICA IDENTITY FULL required.
 *
 * Semantics mirror Postgres:
 *   - permissive policies are OR'd together
 *   - restrictive policies are AND'd over the top
 *   - RLS off        -> everything visible
 *   - RLS on, none   -> nothing visible (default deny)
 */
export async function selectPredicate(schema, table, role) {
  // service_role holds BYPASSRLS, so no policy ever constrains it. Deriving a
  // predicate from pg_policies would yield 'false' (no policy names it) and
  // silently deny the trusted path.
  if (role === 'service_role') return 'true';

  const key = `${schema}.${table}:${role}`;
  if (catalog.policies.has(key)) return catalog.policies.get(key);

  const tbl = getTable(schema, table);
  if (!tbl) throw Object.assign(new Error(`unknown table ${schema}.${table}`), { status: 404 });
  if (!tbl.rls) { catalog.policies.set(key, 'true'); return 'true'; }

  const { rows } = await db.query(
    `select permissive, qual, roles
       from pg_policies
      where schemaname = $1 and tablename = $2 and cmd in ('SELECT','ALL') and qual is not null`,
    [schema, table],
  );

  const applies = (r) => r.roles.includes(role) || r.roles.includes('public');
  const permissive  = rows.filter((r) => applies(r) && r.permissive === 'PERMISSIVE').map((r) => `(${r.qual})`);
  const restrictive = rows.filter((r) => applies(r) && r.permissive === 'RESTRICTIVE').map((r) => `(${r.qual})`);

  let expr = permissive.length ? permissive.join(' or ') : 'false';
  if (restrictive.length) expr = `(${expr}) and ${restrictive.join(' and ')}`;

  catalog.policies.set(key, expr);
  return expr;
}

export function invalidatePolicyCache() {
  catalog.policies.clear();
}
