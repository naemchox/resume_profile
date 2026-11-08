// Studio talks to the meta API, which demands the service key.
// The key lives in localStorage only — the Studio is a local tool and the key
// never leaves this browser. It is a superuser credential: never ship it.

const KEY_STORAGE = 'basalt.service_key';
const ADMIN_STORAGE = 'basalt.admin_key';

export function getServiceKey() {
  return localStorage.getItem(KEY_STORAGE) ?? '';
}
export function setServiceKey(k) {
  localStorage.setItem(KEY_STORAGE, k.trim());
}
export function clearServiceKey() {
  localStorage.removeItem(KEY_STORAGE);
}

// The admin key is the provider-level credential that manages projects. Kept
// separately from the per-project service key.
export function getAdminKey() {
  return localStorage.getItem(ADMIN_STORAGE) ?? '';
}
export function setAdminKey(k) {
  localStorage.setItem(ADMIN_STORAGE, k.trim());
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { apikey: getServiceKey(), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status });
  return data;
}

export const api = {
  stats: () => request('/meta/v1/stats'),
  tables: () => request('/meta/v1/tables'),
  policies: () => request('/meta/v1/policies'),
  users: () => request('/meta/v1/users'),
  deleteUser: (id) => request(`/meta/v1/users/${id}`, { method: 'DELETE' }),
  setAppMetadata: (id, app_metadata) => request(`/meta/v1/users/${id}`, { method: 'PATCH', body: { app_metadata } }),

  query: (sql) => request('/meta/v1/query', { method: 'POST', body: { sql } }),
  simulate: (payload) => request('/meta/v1/simulate', { method: 'POST', body: payload }),

  realtimeTables: () => request('/meta/v1/realtime'),
  enableRealtime: (schema, table) => request('/meta/v1/realtime/enable', { method: 'POST', body: { schema, table } }),
  disableRealtime: (schema, table) => request('/meta/v1/realtime/disable', { method: 'POST', body: { schema, table } }),

  buckets: () => request('/storage/v1/bucket'),
  createBucket: (id, isPublic) => request('/storage/v1/bucket', { method: 'POST', body: { id, public: isPublic } }),

  /** Read rows through the ordinary REST path, as service_role. */
  rows: (table, limit = 100) =>
    fetch(`/rest/v1/${table}?limit=${limit}`, { headers: { apikey: getServiceKey() } }).then(async (r) => {
      const t = await r.text();
      const d = t ? JSON.parse(t) : [];
      if (!r.ok) throw new Error(d?.error ?? r.statusText);
      return d;
    }),
};

// REST mutations, as service_role (bypasses RLS — this is the admin editor).
async function restMutate(path, { method, body, prefer = 'return=representation' } = {}) {
  const res = await fetch(path, {
    method,
    headers: { apikey: getServiceKey(), 'content-type': 'application/json', prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status });
  return data;
}

export const data = {
  rows: (table, limit = 200) =>
    restMutate(`/rest/v1/${encodeURIComponent(table)}?limit=${limit}`, { method: 'GET', prefer: '' }),
  insert: (table, values) =>
    restMutate(`/rest/v1/${encodeURIComponent(table)}`, { method: 'POST', body: values }),
  update: (table, filter, values) =>
    restMutate(`/rest/v1/${encodeURIComponent(table)}?${filter}`, { method: 'PATCH', body: values }),
  remove: (table, filter) =>
    restMutate(`/rest/v1/${encodeURIComponent(table)}?${filter}`, { method: 'DELETE' }),
};

/** Provider admin API — projects. Uses the admin key, not a service key. */
async function adminRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { apikey: getAdminKey(), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status });
  return data;
}

export const projectsApi = {
  list: () => adminRequest('/projects'),
  create: (name) => adminRequest('/projects', { method: 'POST', body: { name } }),
  remove: (id) => adminRequest(`/projects/${id}`, { method: 'DELETE' }),
};

/** Live changelog feed. Connects as service_role, so it observes every table. */
export function openRealtimeInspector(tables, onEvent, onStatus) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/realtime/v1?apikey=${encodeURIComponent(getServiceKey())}`);

  ws.onopen = () => {
    onStatus('connected');
    for (const t of tables) {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `inspect:${t.schema}.${t.table}`,
        config: { postgres_changes: { schema: t.schema, table: t.table, event: '*' } },
      }));
    }
  };
  ws.onclose = () => onStatus('disconnected');
  ws.onerror = () => onStatus('error');
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'change') onEvent(msg.payload);
    if (msg.type === 'error') onStatus('error', msg.message);
  };
  return () => ws.close();
}
