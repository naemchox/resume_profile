// Basalt — HTTP entrypoint.

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init, asRole, asSuperuser, refreshCatalog, q, getTable } from './db.mjs';
import * as jwtLib from './jwt.mjs';
import * as auth from './auth.mjs';
import * as rest from './rest.mjs';
import * as storage from './storage.mjs';
import * as meta from './meta.mjs';
import * as projects from './projects.mjs';
import { attachRealtime, startChangeReader } from './realtime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = process.env.BASALT_DATA_DIR || join(ROOT, '.data');
const PORT = Number(process.env.PORT || 5252);

// -----------------------------------------------------------------------------
// Postgres error -> HTTP status
// -----------------------------------------------------------------------------
const PG_STATUS = {
  '42501': 403, // insufficient_privilege — includes RLS WITH CHECK violations
  '23505': 409, // unique_violation
  '23503': 409, // foreign_key_violation
  '23502': 400, // not_null_violation
  '23514': 400, // check_violation
  '22P02': 400, // invalid_text_representation
  '42703': 400, // undefined_column
  '42P01': 404, // undefined_table
};

function statusFor(err) {
  if (err.status) return err.status;
  if (err.code && PG_STATUS[err.code]) return PG_STATUS[err.code];
  if (/row-level security/i.test(err.message || '')) return 403;
  return 500;
}

// -----------------------------------------------------------------------------
// Small HTTP helpers
// -----------------------------------------------------------------------------
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-total-count',
};

const send = (res, status, body, headers = {}) => {
  const payload = body === null || body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', ...CORS, ...headers });
  res.end(payload);
};

const sendRaw = (res, status, buf, headers = {}) => {
  res.writeHead(status, { ...CORS, ...headers });
  res.end(buf);
};

const fail = (res, err) => {
  const status = statusFor(err);
  if (status >= 500) console.error('[basalt]', err);
  send(res, status, { error: err.message, code: err.code ?? null });
};

async function readBody(req, limit = 50 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const buf = await readBody(req, 8 * 1024 * 1024);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch { throw Object.assign(new Error('invalid json body'), { status: 400 }); }
}

// -----------------------------------------------------------------------------
// Route handlers
// -----------------------------------------------------------------------------
let SERVICE_KEY = null;      // the default project's service key
let PUBLISHABLE_KEY = null;  // the default project's publishable key
let ADMIN_KEY = null;        // provider-level: manages projects

async function handleAuth(req, res, url, segments) {
  const [, , action] = segments; // auth, v1, <action>

  if (action === 'jwks' && req.method === 'GET') {
    return send(res, 200, { alg: 'ES256', public_key: jwtLib.publicKeyPem() });
  }

  // Which project's user pool this request targets is decided by the key it
  // presents. Signing up through project A's key creates a user in project A.
  const { project } = auth.resolveProject(req);

  if (action === 'signup' && req.method === 'POST') {
    return send(res, 200, await auth.signup(project.id, await readJson(req)));
  }

  if (action === 'token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const body = await readJson(req);
    if (grant === 'password') return send(res, 200, await auth.signin(project.id, body));
    if (grant === 'refresh_token') return send(res, 200, await auth.refresh(body.refresh_token));
    throw Object.assign(new Error('unsupported grant_type'), { status: 400 });
  }

  if (action === 'logout' && req.method === 'POST') {
    const body = await readJson(req);
    return send(res, 200, await auth.logout(body.refresh_token, body.scope));
  }

  if (action === 'user') {
    const identity = auth.resolveIdentity(req);
    if (!identity.userId) throw Object.assign(new Error('not authenticated'), { status: 401 });
    if (req.method === 'GET') return send(res, 200, await auth.getUser(identity.userId));
    if (req.method === 'PUT') return send(res, 200, await auth.updateUser(identity.userId, await readJson(req)));
  }

  throw Object.assign(new Error('not found'), { status: 404 });
}

async function handleRest(req, res, url, segments) {
  const identity = auth.resolveIdentity(req);
  const prefer = rest.parsePrefer(req.headers['prefer']);

  // /rest/v1/rpc/<fn>
  if (segments[2] === 'rpc') {
    const fn = segments[3];
    if (!fn || req.method !== 'POST') throw Object.assign(new Error('not found'), { status: 404 });
    return send(res, 200, await callRpc(fn, await readJson(req), identity));
  }

  const table = segments[2];
  if (!table) throw Object.assign(new Error('table required'), { status: 404 });
  // The schema comes from the resolved project, never from the client. This is
  // what keeps one tenant's REST calls inside their own data.
  const schema = identity.schema;
  if (!getTable(schema, table)) throw Object.assign(new Error(`unknown table ${schema}.${table}`), { status: 404 });

  const run = (fn) => asRole(identity.role, identity.claims, fn);

  if (req.method === 'GET') {
    const { text, values } = rest.compileSelect(schema, table, url.searchParams);
    const { rows } = await run((tx) => tx.query(text, values));
    const headers = {};
    if (prefer.count) {
      const c = rest.compileCount(schema, table, url.searchParams);
      const { rows: cr } = await run((tx) => tx.query(c.text, c.values));
      headers['content-range'] = `0-${Math.max(rows.length - 1, 0)}/${cr[0].n}`;
      headers['x-total-count'] = String(cr[0].n);
    }
    return send(res, 200, rows, headers);
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const { text, values } = rest.compileInsert(schema, table, body, {
      onConflict: url.searchParams.get('on_conflict'),
      returning: prefer.returning,
    });
    const { rows } = await run((tx) => tx.query(text, values));
    return send(res, 201, prefer.returning ? rows : null);
  }

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const { text, values } = rest.compileUpdate(schema, table, body, url.searchParams, {
      returning: prefer.returning, allowUnfiltered: prefer.allowUnfiltered,
    });
    const { rows } = await run((tx) => tx.query(text, values));
    return send(res, 200, prefer.returning ? rows : null);
  }

  if (req.method === 'DELETE') {
    const { text, values } = rest.compileDelete(schema, table, url.searchParams, {
      returning: prefer.returning, allowUnfiltered: prefer.allowUnfiltered,
    });
    const { rows } = await run((tx) => tx.query(text, values));
    return send(res, 200, prefer.returning ? rows : null);
  }

  throw Object.assign(new Error('method not allowed'), { status: 405 });
}

/** RPC: call a Postgres function as the caller's role. Name validated against pg_proc. */
async function callRpc(fnName, args, identity) {
  const schema = identity.schema;
  const { rows: found } = await asSuperuser((tx) =>
    tx.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = $1 and p.proname = $2`,
      [schema, fnName],
    ),
  );
  if (!found.length) throw Object.assign(new Error(`unknown function ${schema}.${fnName}`), { status: 404 });

  const keys = Object.keys(args || {});
  // Named arguments: `fn(a => $1, b => $2)`. Keys are validated as identifiers.
  for (const k of keys) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(k)) throw Object.assign(new Error(`invalid argument name "${k}"`), { status: 400 });
  }
  const argSql = keys.map((k, i) => `${q(k)} => $${i + 1}`).join(', ');
  const values = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));

  const { rows } = await asRole(identity.role, identity.claims, (tx) =>
    tx.query(`select * from ${q(schema)}.${q(fnName)}(${argSql})`, values),
  );
  // Scalar-returning functions come back as a single unnamed column.
  if (rows.length === 1 && Object.keys(rows[0]).length === 1) return Object.values(rows[0])[0];
  return rows;
}

async function handleStorage(req, res, url, segments) {
  // /storage/v1/bucket[/...]  |  /storage/v1/object/<bucket>/<path...>
  const kind = segments[2];

  if (kind === 'bucket') {
    const identity = auth.resolveIdentity(req);
    meta.requireService(identity);
    if (req.method === 'GET') return send(res, 200, await storage.listBuckets(identity.projectId));
    if (req.method === 'POST') {
      const body = await readJson(req);
      return send(res, 200, await storage.createBucket(identity.projectId, body.id, { public: !!body.public }));
    }
  }

  if (kind === 'object') {
    // Signed download needs no identity at all — the signature IS the grant.
    if (segments[3] === 'sign') {
      const bucket = decodeURIComponent(segments[4]);
      const name = segments.slice(5).map(decodeURIComponent).join('/');
      if (req.method === 'GET') {
        const { body, mimeType } = await storage.downloadSigned({
          bucket, name, exp: url.searchParams.get('exp'), sig: url.searchParams.get('sig'),
        });
        return sendRaw(res, 200, body, { 'content-type': mimeType });
      }
    }

    const identity = auth.resolveIdentity(req);

    if (segments[3] === 'signed-url' && req.method === 'POST') {
      const body = await readJson(req);
      return send(res, 200, await storage.createSignedUrl({ ...body, identity }));
    }
    if (segments[3] === 'list' && req.method === 'POST') {
      const body = await readJson(req);
      return send(res, 200, await storage.list({ bucket: body.bucket, prefix: body.prefix ?? '', identity }));
    }

    const bucket = decodeURIComponent(segments[3] ?? '');
    const name = segments.slice(4).map(decodeURIComponent).join('/');
    if (!bucket || !name) throw Object.assign(new Error('bucket and object name required'), { status: 400 });

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req);
      const row = await storage.upload({ bucket, name, body, mimeType: req.headers['content-type'], identity });
      return send(res, 200, { id: row.id, bucket_id: row.bucket_id, name: row.name, size: Number(row.size) });
    }
    if (req.method === 'GET') {
      const { body, mimeType } = await storage.download({ bucket, name, identity });
      return sendRaw(res, 200, body, { 'content-type': mimeType });
    }
    if (req.method === 'DELETE') {
      return send(res, 200, await storage.remove({ bucket, name, identity }));
    }
  }

  throw Object.assign(new Error('not found'), { status: 404 });
}

async function handleMeta(req, res, url, segments) {
  const identity = auth.resolveIdentity(req);
  meta.requireService(identity);
  const [, , action, ...rest_] = segments;
  const { schema, projectId } = identity; // the service key selected the project

  if (action === 'tables' && req.method === 'GET')    return send(res, 200, await meta.tables(schema));
  if (action === 'policies' && req.method === 'GET')  return send(res, 200, await meta.policies(schema));
  if (action === 'stats' && req.method === 'GET')     return send(res, 200, await meta.stats(schema, projectId));
  if (action === 'query' && req.method === 'POST')    return send(res, 200, await meta.runSql((await readJson(req)).sql, schema));
  if (action === 'simulate' && req.method === 'POST') return send(res, 200, await meta.simulate({ ...(await readJson(req)), schema }));

  if (action === 'users') {
    if (req.method === 'GET') return send(res, 200, await meta.users(projectId, { limit: Number(url.searchParams.get('limit') || 100) }));
    if (req.method === 'DELETE' && rest_[0]) return send(res, 200, await meta.deleteUser(projectId, rest_[0]));
    if (req.method === 'PATCH' && rest_[0]) {
      const body = await readJson(req);
      return send(res, 200, await meta.setAppMetadata(projectId, rest_[0], body.app_metadata ?? {}));
    }
  }

  if (action === 'realtime') {
    if (req.method === 'GET') return send(res, 200, await meta.realtimeTables(schema));
    const body = req.method === 'POST' ? await readJson(req) : {};
    if (rest_[0] === 'enable')  return send(res, 200, await meta.enableRealtime(schema, body.table));
    if (rest_[0] === 'disable') return send(res, 200, await meta.disableRealtime(schema, body.table));
  }

  throw Object.assign(new Error('not found'), { status: 404 });
}

// -----------------------------------------------------------------------------
// Provider admin API — create/list/delete projects. Gated by the ADMIN key,
// which sits above every project's service key.
// -----------------------------------------------------------------------------
function requireAdmin(req) {
  const key = req.headers['apikey'] || '';
  if (!ADMIN_KEY || key !== ADMIN_KEY) throw Object.assign(new Error('admin key required'), { status: 403 });
}

async function handleProjects(req, res, url, segments) {
  requireAdmin(req);
  const id = segments[1]; // /projects/<id>

  if (!id) {
    if (req.method === 'GET') return send(res, 200, await projects.allProjects({ withSecret: true }));
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!body.name) throw Object.assign(new Error('name required'), { status: 400 });
      return send(res, 201, await projects.createProject(body.name));
    }
  } else if (req.method === 'DELETE') {
    return send(res, 200, await projects.removeProject(id));
  }
  throw Object.assign(new Error('not found'), { status: 404 });
}

// -----------------------------------------------------------------------------
// Static file serving for the Studio dashboard
// -----------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.png': 'image/png',
};

/** Serve one file from ROOT, confirming containment first. */
async function serveFromRoot(res, relPath) {
  const file = normalize(join(ROOT, relPath));
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    return send(res, 404, { error: 'not found' });
  }
  const buf = await readFile(file);
  return sendRaw(res, 200, buf, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
}

async function serveStudio(req, res, url) {
  // Example apps (backend_test.html, chat.html) and the SDK must be served over
  // HTTP: ES module imports are blocked on the file:// origin. Any root-level
  // .html file is fair game; serveFromRoot re-checks containment.
  if (/^\/[\w.-]+\.html$/.test(url.pathname)) return serveFromRoot(res, url.pathname.slice(1));
  if (url.pathname.startsWith('/sdk/')) return serveFromRoot(res, url.pathname.slice(1));

  const dist = join(ROOT, 'studio', 'dist');
  if (!existsSync(dist)) {
    return sendRaw(res, 200, Buffer.from(
      `<!doctype html><meta charset=utf-8><title>Basalt</title>
       <body style="font:16px/1.6 ui-sans-serif,system-ui;max-width:40rem;margin:6rem auto;padding:0 1.5rem">
       <h1 style="font-weight:600">Basalt is running</h1>
       <p>The API is live on this port. The Studio dashboard has not been built yet.</p>
       <pre style="background:#f4f4f5;padding:1rem;border-radius:.5rem">cd studio && npm install && npm run build</pre>
       <p>API surface: <code>/auth/v1</code>, <code>/rest/v1</code>, <code>/realtime/v1</code>, <code>/storage/v1</code>, <code>/meta/v1</code></p>`,
    ), { 'content-type': 'text/html' });
  }

  // Resolve inside dist, then confirm containment — no `../` escapes.
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  let file = normalize(join(dist, rel));
  if (!file.startsWith(dist)) return send(res, 403, { error: 'forbidden' });
  if (!existsSync(file)) file = join(dist, 'index.html'); // SPA fallback

  const buf = await readFile(file);
  return sendRaw(res, 200, buf, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
async function loadServiceKey() {
  if (process.env.BASALT_SERVICE_KEY) return process.env.BASALT_SERVICE_KEY;
  const path = join(DATA_DIR, 'service-key');
  if (existsSync(path)) return (await readFile(path, 'utf8')).trim();
  const key = `sk_${randomBytes(32).toString('base64url')}`;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path, key, { mode: 0o600 });
  return key;
}

/**
 * The publishable key — the project's public identifier, like Firebase's apiKey.
 * Safe to ship in client code; it's not a secret. Stored world-readable so it
 * can be copied into a config, unlike the 0600 service key.
 */
async function loadPublishableKey() {
  if (process.env.BASALT_PUBLISHABLE_KEY) return process.env.BASALT_PUBLISHABLE_KEY;
  const path = join(DATA_DIR, 'publishable-key');
  if (existsSync(path)) return (await readFile(path, 'utf8')).trim();
  const key = `pk_${randomBytes(24).toString('base64url')}`;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path, key);
  return key;
}

/** The provider admin key — manages projects, sits above every service key. Secret. */
async function loadAdminKey() {
  if (process.env.BASALT_ADMIN_KEY) return process.env.BASALT_ADMIN_KEY;
  const path = join(DATA_DIR, 'admin-key');
  if (existsSync(path)) return (await readFile(path, 'utf8')).trim();
  const key = `ak_${randomBytes(32).toString('base64url')}`;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path, key, { mode: 0o600 });
  return key;
}

export async function start({ port = PORT, dataDir = DATA_DIR, persist = true } = {}) {
  await mkdir(dataDir, { recursive: true });
  await init({ dataDir: persist ? join(dataDir, 'pg') : null });

  SERVICE_KEY = await loadServiceKey();
  PUBLISHABLE_KEY = await loadPublishableKey();
  ADMIN_KEY = await loadAdminKey();
  // Register the default project (schema=public) with the process's keys, so the
  // registry — and every existing table, user, and client — resolves to it.
  await projects.ensureDefaultProject({ publishableKey: PUBLISHABLE_KEY, serviceKey: SERVICE_KEY });
  await jwtLib.loadKeys(dataDir);
  storage.configureStorage({ dataDir, key: SERVICE_KEY });
  await startChangeReader();

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return sendRaw(res, 204, '', CORS);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const segments = url.pathname.split('/').filter(Boolean);

    try {
      if (url.pathname === '/health') return send(res, 200, { status: 'ok' });
      // Public project config — the Firebase-style snippet a client app boots from.
      // Resolves by the presented publishable key, so each project's client gets
      // its own config; keyless callers get the default project. Only ever the
      // publishable key — the service key never leaves the server.
      if (url.pathname === '/config' || url.pathname === '/config.json') {
        const { project } = auth.resolveProject(req);
        return send(res, 200, {
          url: `${url.protocol}//${req.headers.host}`,
          project: project.id,
          publishable_key: project.publishableKey,
        });
      }
      switch (segments[0]) {
        case 'auth':     return await handleAuth(req, res, url, segments);
        case 'rest':     return await handleRest(req, res, url, segments);
        case 'storage':  return await handleStorage(req, res, url, segments);
        case 'meta':     return await handleMeta(req, res, url, segments);
        case 'projects': return await handleProjects(req, res, url, segments);
        default:         return await serveStudio(req, res, url);
      }
    } catch (err) {
      return fail(res, err);
    }
  });

  attachRealtime(server);
  await new Promise((resolve) => server.listen(port, resolve));

  return { server, serviceKey: SERVICE_KEY, publishableKey: PUBLISHABLE_KEY, adminKey: ADMIN_KEY, port };
}

// pathToFileURL, not string concatenation: a space (or any non-ASCII char) in the
// path is percent-encoded in import.meta.url, so the naive compare silently fails
// and the server never starts.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port, serviceKey, publishableKey, adminKey } = await start();
  console.log(`\n  Basalt ready\n`);
  console.log(`  API        http://localhost:${port}`);
  console.log(`  Studio     http://localhost:${port}`);
  console.log(`  Chat demo  http://localhost:${port}/chat.html`);
  console.log(`\n  default project`);
  console.log(`    Publishable key  ${publishableKey}   (safe to ship in client apps)`);
  console.log(`    Service key      ${serviceKey}   (bypasses RLS — server-side only)`);
  console.log(`\n  Admin key  ${adminKey}   (manages projects — Studio → Projects)\n`);
}
