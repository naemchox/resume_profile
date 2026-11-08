// Projects: the control plane a provider uses to give each customer their own
// isolated backend — its own data schema, its own publishable and service keys.
//
// Gated by the provider ADMIN key (ak_…), which sits above every project's
// service key. See index.mjs.

import { randomBytes } from 'node:crypto';
import { asSuperuser, refreshProjects, refreshCatalog, getProjectById, listProjects } from './db.mjs';

const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

const newPk = () => `pk_${randomBytes(24).toString('base64url')}`;
const newSk = () => `sk_${randomBytes(32).toString('base64url')}`;

const RESERVED = new Set(['default', 'public', 'auth', 'storage', 'realtime', 'basalt']);
const slugify = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);

/** Register the default project (schema=public) with the process's existing keys. Idempotent. */
export async function ensureDefaultProject({ publishableKey, serviceKey }) {
  await asSuperuser((tx) =>
    tx.query(
      `insert into basalt.projects (id, name, schema_name, publishable_key, service_key)
       values ('default', 'Default', 'public', $1, $2)
       on conflict (id) do update set publishable_key = excluded.publishable_key,
                                       service_key = excluded.service_key`,
      [publishableKey, serviceKey],
    ),
  );
  await refreshProjects();
}

export async function createProject(name) {
  const base = slugify(name) || `project`;
  let id = base;
  // Ensure a unique, non-reserved id.
  for (let n = 1; RESERVED.has(id) || getProjectById(id); n++) id = `${base}-${n}`;
  const schema = `proj_${id.replace(/-/g, '_')}`;
  const publishableKey = newPk();
  const serviceKey = newSk();

  await asSuperuser(async (tx) => {
    await tx.query(`select basalt.provision($1)`, [schema]);
    await tx.query(
      `insert into basalt.projects (id, name, schema_name, publishable_key, service_key) values ($1, $2, $3, $4, $5)`,
      [id, name || id, schema, publishableKey, serviceKey],
    );
  });
  await refreshProjects();
  await refreshCatalog();
  return publicProject(getProjectById(id), { withSecret: true });
}

export async function removeProject(id) {
  if (id === 'default') throw httpError(400, 'the default project cannot be deleted', 'protected');
  const p = getProjectById(id);
  if (!p) throw httpError(404, 'project not found', 'not_found');
  await asSuperuser(async (tx) => {
    await tx.query(`drop schema if exists ${quoteIdent(p.schema)} cascade`);
    await tx.query(`delete from auth.users where project_id = $1`, [id]);
    await tx.query(`delete from basalt.projects where id = $1`, [id]);
  });
  await refreshProjects();
  await refreshCatalog();
  return { ok: true };
}

export function allProjects({ withSecret = false } = {}) {
  return listProjects().map((p) => publicProject(p, { withSecret }));
}

function publicProject(p, { withSecret = false } = {}) {
  const out = {
    id: p.id, name: p.name, schema: p.schema,
    publishable_key: p.publishableKey, created_at: p.createdAt,
  };
  if (withSecret) out.service_key = p.serviceKey;
  return out;
}

// Local quoting for the one place we build DDL from a name we generated ourselves.
function quoteIdent(ident) { return `"${String(ident).replace(/"/g, '""')}"`; }
