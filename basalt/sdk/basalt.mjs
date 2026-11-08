// Basalt client SDK. Works in the browser and in Node 18+.
//
//   import { createClient } from './sdk/basalt.mjs';
//   const basalt = createClient('http://localhost:5252', ANON_KEY);
//
//   await basalt.auth.signUp({ email, password });
//   const { data } = await basalt.from('notes').select('id,title').eq('owner', uid);
//   basalt.channel('notes').on('postgres_changes', { table: 'notes' }, cb).subscribe();

// -----------------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------------
/** In-memory fallback: Node exposes a `localStorage` global that is not usable Web Storage. */
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

/** Duck-type, don't existence-check: `globalThis.localStorage` can exist and still not work. */
function detectStorage() {
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') {
      ls.getItem('basalt.probe'); // Safari private mode throws here
      return ls;
    }
  } catch { /* fall through */ }
  return memoryStorage();
}

class Auth {
  constructor(client, storage) {
    this.client = client;
    this.session = null;
    this._listeners = new Set();
    // fundamental.md §6.8: a naive SDK fires ten parallel refreshes under load,
    // each rotating the token, and they revoke each other's family. One
    // in-flight refresh, shared by every waiter.
    this._refreshing = null;
    this._timer = null;
    this._store = storage ?? detectStorage();
    this._restore();
  }

  _storage() { return this._store; }

  _restore() {
    const raw = this._store.getItem('basalt.session');
    if (raw) {
      try { this._setSession(JSON.parse(raw), false); } catch { /* corrupt, ignore */ }
    }
  }

  _setSession(session, notify = true) {
    this.session = session;
    const store = this._store;
    if (session) store.setItem('basalt.session', JSON.stringify(session));
    else store.removeItem('basalt.session');

    clearTimeout(this._timer);
    if (session?.expires_in) {
      // Refresh at 75% of the token's life, never sooner than 10s out.
      const ms = Math.max(session.expires_in * 1000 * 0.75, 10_000);
      this._timer = setTimeout(() => this.refreshSession().catch(() => {}), ms);
      this._timer.unref?.();
    }
    if (notify) for (const fn of this._listeners) fn(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
  }

  onAuthStateChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // signUp / signInWithPassword resolve to { data, error } — never throw — so
  // callers destructure the way they do with the query builder. A returning user
  // hitting "sign up", or a bad password, is an ordinary error, not an exception.
  async signUp({ email, password, user_metadata }) {
    try {
      const data = await this.client._fetch('/auth/v1/signup', {
        method: 'POST', body: { email, password, user_metadata },
      });
      this._setSession(data);
      return { data, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message, status: error.status, code: error.code } };
    }
  }

  async signInWithPassword({ email, password }) {
    try {
      const data = await this.client._fetch('/auth/v1/token?grant_type=password', {
        method: 'POST', body: { email, password },
      });
      this._setSession(data);
      return { data, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message, status: error.status, code: error.code } };
    }
  }

  /** Single-flight. Concurrent callers await the same promise. */
  async refreshSession() {
    if (this._refreshing) return this._refreshing;
    if (!this.session?.refresh_token) throw new Error('no session to refresh');

    this._refreshing = (async () => {
      try {
        const data = await this.client._fetch('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', body: { refresh_token: this.session.refresh_token }, skipAuth: true,
        });
        this._setSession(data);
        return data;
      } catch (err) {
        // Reuse detected, or the family was revoked. The session is gone.
        this._setSession(null);
        throw err;
      } finally {
        this._refreshing = null;
      }
    })();
    return this._refreshing;
  }

  async signOut({ scope = 'local' } = {}) {
    if (this.session?.refresh_token) {
      await this.client._fetch('/auth/v1/logout', {
        method: 'POST', body: { refresh_token: this.session.refresh_token, scope },
      }).catch(() => {});
    }
    this._setSession(null);
    return { error: null };
  }

  getSession() { return this.session; }
  getUser() { return this.session?.user ?? null; }
  get accessToken() { return this.session?.access_token ?? null; }
}

// -----------------------------------------------------------------------------
// Query builder
// -----------------------------------------------------------------------------
// Thenable: `await client.from('t').select()` resolves to { data, error }.
class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.params = new URLSearchParams();
    this.method = 'GET';
    this.body = null;
    this.headers = {};
    this._single = false;
  }

  select(cols = '*') {
    if (this.method === 'GET') this.params.set('select', cols);
    else this.headers['prefer'] = this._mergePrefer('return=representation');
    return this;
  }

  _mergePrefer(v) {
    const existing = this.headers['prefer'];
    return existing ? `${existing},${v}` : v;
  }

  _filter(op, col, val) { this.params.append(col, `${op}.${val}`); return this; }

  eq(c, v)   { return this._filter('eq', c, v); }
  neq(c, v)  { return this._filter('neq', c, v); }
  gt(c, v)   { return this._filter('gt', c, v); }
  gte(c, v)  { return this._filter('gte', c, v); }
  lt(c, v)   { return this._filter('lt', c, v); }
  lte(c, v)  { return this._filter('lte', c, v); }
  like(c, v) { return this._filter('like', c, v); }
  ilike(c,v) { return this._filter('ilike', c, v); }
  is(c, v)   { return this._filter('is', c, v); }
  in(c, arr) { return this._filter('in', c, `(${arr.join(',')})`); }
  contains(c, v) { return this._filter('cs', c, typeof v === 'string' ? v : JSON.stringify(v)); }
  textSearch(c, v) { return this._filter('fts', c, v); }
  not(op, c, v) { this.params.append(c, `not.${op}.${v}`); return this; }
  or(expr) { this.params.append('or', `(${expr})`); return this; }

  order(col, { ascending = true, nullsFirst } = {}) {
    const mods = [ascending ? 'asc' : 'desc'];
    if (nullsFirst !== undefined) mods.push(nullsFirst ? 'nullsfirst' : 'nullslast');
    const prev = this.params.get('order');
    this.params.set('order', prev ? `${prev},${col}.${mods.join('.')}` : `${col}.${mods.join('.')}`);
    return this;
  }

  limit(n)  { this.params.set('limit', String(n)); return this; }
  offset(n) { this.params.set('offset', String(n)); return this; }
  range(from, to) { return this.offset(from).limit(to - from + 1); }
  single()  { this._single = true; return this.limit(1); }
  count()   { this.headers['prefer'] = this._mergePrefer('count=exact'); return this; }

  insert(values)  { this.method = 'POST';   this.body = values; return this; }
  update(values)  { this.method = 'PATCH';  this.body = values; return this; }
  delete()        { this.method = 'DELETE'; return this; }

  upsert(values, { onConflict } = {}) {
    this.method = 'POST';
    this.body = values;
    if (onConflict) this.params.set('on_conflict', onConflict);
    return this;
  }

  /** Opt in to a full-table UPDATE/DELETE. The server refuses one otherwise. */
  allowUnfiltered() { this.headers['prefer'] = this._mergePrefer('allow-unfiltered'); return this; }

  async then(resolve, reject) {
    try {
      const qs = this.params.toString();
      const data = await this.client._fetch(`/rest/v1/${this.table}${qs ? `?${qs}` : ''}`, {
        method: this.method, body: this.body, headers: this.headers,
      });
      const rows = data ?? [];
      resolve({ data: this._single ? (rows[0] ?? null) : rows, error: null });
    } catch (error) {
      // Errors resolve rather than reject — callers destructure, they don't try/catch.
      resolve({ data: null, error: { message: error.message, status: error.status, code: error.code } });
    }
    return undefined;
  }
}

// -----------------------------------------------------------------------------
// Realtime
// -----------------------------------------------------------------------------
class Channel {
  constructor(rt, name) {
    this.rt = rt;
    this.name = name;
    this.config = {};
    this.handlers = { change: [], broadcast: [], presence: [] };
    // Watermark for resumption: the last commit id we actually delivered.
    this.lastCommitId = null;
    this.subscribed = false;
  }

  on(type, filter, cb) {
    if (type === 'postgres_changes') {
      this.config.postgres_changes = { schema: 'public', event: '*', ...filter };
      this.handlers.change.push(cb);
    } else if (type === 'broadcast') {
      this.config.broadcast = { self: filter?.self ?? false };
      this.handlers.broadcast.push({ event: filter?.event, cb });
    } else if (type === 'presence') {
      this.config.presence = this.config.presence ?? {};
      this.handlers.presence.push(cb);
    }
    return this;
  }

  subscribe(cb) {
    this.rt._register(this);
    this.rt._connect();
    this._onSubscribed = cb;
    return this;
  }

  /** Request the initial state and the stream in one atomic step. */
  withSnapshot() {
    this.config.postgres_changes = { ...this.config.postgres_changes, snapshot: true };
    return this;
  }

  send(event, payload) {
    this.rt._send({ type: 'broadcast', channel: this.name, event, payload });
  }

  track(state) {
    this.config.presence = this.config.presence ?? {};
    this.rt._send({ type: 'presence', channel: this.name, state });
  }

  unsubscribe() {
    this.rt._send({ type: 'unsubscribe', channel: this.name });
    this.rt.channels.delete(this.name);
  }
}

class Realtime {
  constructor(client) {
    this.client = client;
    this.channels = new Map();
    this.ws = null;
    this.attempt = 0;
    this.connecting = false;
  }

  _register(chan) { this.channels.set(chan.name, chan); }

  channel(name) {
    if (!this.channels.has(name)) this.channels.set(name, new Channel(this, name));
    return this.channels.get(name);
  }

  _url() {
    const u = new URL(this.client.url);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/realtime/v1';
    // Always send the publishable key — it identifies the project. The token
    // (when signed in) carries the user, but the key is what routes the socket
    // to the right tenant; a token alone can't.
    if (this.client.key) u.searchParams.set('apikey', this.client.key);
    const token = this.client.auth.accessToken;
    if (token) u.searchParams.set('token', token);
    return u.toString();
  }

  _connect() {
    if (this.ws || this.connecting) return;
    this.connecting = true;

    const WS = globalThis.WebSocket ?? this.client.WebSocketImpl;
    if (!WS) throw new Error('no WebSocket implementation; pass { WebSocketImpl } to createClient');

    const ws = new WS(this._url());
    this.ws = ws;

    ws.onopen = () => {
      this.connecting = false;
      this.attempt = 0;
      for (const chan of this.channels.values()) this._subscribe(chan);
    };

    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      const chan = this.channels.get(msg.channel);

      switch (msg.type) {
        case 'subscribed':
          if (!chan) return;
          chan.subscribed = true;
          if (msg.watermark != null) chan.lastCommitId = msg.watermark;
          chan._onSubscribed?.('SUBSCRIBED', { snapshot: msg.snapshot, resumed: msg.resumed });
          break;
        case 'change':
          if (!chan) return;
          chan.lastCommitId = msg.payload.commit_id;
          chan.handlers.change.forEach((cb) => cb(msg.payload));
          break;
        case 'broadcast':
          chan?.handlers.broadcast.forEach(({ event, cb }) => {
            if (!event || event === msg.event) cb(msg.payload, msg.event);
          });
          break;
        case 'presence_state':
          chan?.handlers.presence.forEach((cb) => cb(msg.state));
          break;
        case 'error':
          chan?._onSubscribed?.('CHANNEL_ERROR', { message: msg.message });
          break;
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.connecting = false;
      for (const c of this.channels.values()) c.subscribed = false;
      this._scheduleReconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  _subscribe(chan) {
    const config = { ...chan.config };
    // Resume exactly where we left off. Without `since`, a reconnect would
    // silently drop every change that landed while we were away.
    if (config.postgres_changes && chan.lastCommitId != null) {
      config.postgres_changes = { ...config.postgres_changes, since: chan.lastCommitId, snapshot: false };
    }
    this._send({ type: 'subscribe', channel: chan.name, config });
  }

  _scheduleReconnect() {
    if (!this.channels.size) return;
    // Exponential backoff with full jitter: a server restart must not summon a
    // thundering herd of clients all reconnecting on the same tick.
    const base = Math.min(1000 * 2 ** this.attempt++, 30_000);
    const delay = Math.random() * base;
    const t = setTimeout(() => this._connect(), delay);
    t.unref?.();
  }

  _send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  disconnect() {
    this.channels.clear();
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}

// -----------------------------------------------------------------------------
// Storage
// -----------------------------------------------------------------------------
class Bucket {
  constructor(client, name) { this.client = client; this.name = name; }

  async upload(path, body, { contentType } = {}) {
    try {
      const data = await this.client._fetch(
        `/storage/v1/object/${encodeURIComponent(this.name)}/${path}`,
        { method: 'POST', raw: body, headers: { 'content-type': contentType ?? 'application/octet-stream' } },
      );
      return { data, error: null };
    } catch (error) { return { data: null, error }; }
  }

  async download(path) {
    try {
      const res = await this.client._raw(`/storage/v1/object/${encodeURIComponent(this.name)}/${path}`);
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      return { data: await res.blob?.() ?? Buffer.from(await res.arrayBuffer()), error: null };
    } catch (error) { return { data: null, error }; }
  }

  async list(prefix = '') {
    try {
      return { data: await this.client._fetch('/storage/v1/object/list', { method: 'POST', body: { bucket: this.name, prefix } }), error: null };
    } catch (error) { return { data: null, error }; }
  }

  async remove(path) {
    try {
      return { data: await this.client._fetch(`/storage/v1/object/${encodeURIComponent(this.name)}/${path}`, { method: 'DELETE' }), error: null };
    } catch (error) { return { data: null, error }; }
  }

  async createSignedUrl(path, expiresIn = 3600) {
    try {
      const data = await this.client._fetch('/storage/v1/object/signed-url', {
        method: 'POST', body: { bucket: this.name, name: path, expiresIn },
      });
      return { data: { ...data, signedUrl: this.client.url + data.signedUrl }, error: null };
    } catch (error) { return { data: null, error }; }
  }
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------
class BasaltClient {
  constructor(url, key, opts) {
    this.url = url.replace(/\/$/, '');
    this.key = key ?? null;   // the publishable key (pk_…); may be null in dev
    this.WebSocketImpl = opts.WebSocketImpl ?? null;
    this.auth = new Auth(this, opts.storage);
    this.realtime = new Realtime(this);
  }

  from(table) { return new QueryBuilder(this, table); }
  channel(name) { return this.realtime.channel(name); }
  get storage() { return { from: (b) => new Bucket(this, b) }; }

  async rpc(fn, args = {}) {
    try {
      return { data: await this._fetch(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }), error: null };
    } catch (error) { return { data: null, error }; }
  }

  _headers(extra = {}, skipAuth = false) {
    const h = { ...extra };
    if (this.key) h.apikey = this.key; // omit entirely when unset, so no bogus header
    const token = this.auth.accessToken;
    if (token && !skipAuth) h['authorization'] = `Bearer ${token}`;
    return h;
  }

  async _raw(path, { method = 'GET', body, raw, headers = {}, skipAuth = false } = {}) {
    const init = { method, headers: this._headers(headers, skipAuth) };
    // GET/HEAD may not carry a body at all — not even a null one. fetch throws.
    const bodyAllowed = method !== 'GET' && method !== 'HEAD';
    if (raw !== undefined && bodyAllowed) init.body = raw;
    else if (body != null && bodyAllowed) {
      init.headers['content-type'] = init.headers['content-type'] ?? 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(this.url + path, init);
  }

  /**
   * One transparent retry on 401: refresh the access token, then replay.
   * `skipAuth` guards the refresh call itself against infinite recursion.
   */
  async _fetch(path, opts = {}) {
    let res = await this._raw(path, opts);

    if (res.status === 401 && !opts.skipAuth && this.auth.session?.refresh_token) {
      try {
        await this.auth.refreshSession();
        res = await this._raw(path, opts);
      } catch { /* fall through to the original 401 */ }
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') return null;

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status, code: data?.code });
    }
    return data;
  }
}

/**
 * Create a Basalt client.
 *
 * Firebase-style config object (recommended):
 *   const basalt = createClient({ url: 'https://…', key: 'pk_live_…' });
 *
 * Legacy positional form (still supported):
 *   const basalt = createClient('https://…', 'pk_live_…', { WebSocketImpl });
 */
export function createClient(urlOrConfig, key, opts = {}) {
  if (urlOrConfig && typeof urlOrConfig === 'object') {
    const { url, key: k, ...rest } = urlOrConfig;
    if (!url) throw new Error('createClient: config.url is required');
    return new BasaltClient(url, k ?? null, rest);
  }
  return new BasaltClient(urlOrConfig, key, opts);
}

/**
 * Boot a client straight from a server's public /config endpoint — no config to
 * paste. Fetches { url, publishable_key } and returns a ready client.
 *
 *   const basalt = await connect('https://api.basalt.dev');
 */
export async function connect(origin, opts = {}) {
  const base = String(origin).replace(/\/$/, '');
  const res = await fetch(`${base}/config`);
  if (!res.ok) throw new Error(`could not load /config from ${base}`);
  const cfg = await res.json();
  return new BasaltClient(cfg.url || base, cfg.publishable_key ?? null, opts);
}

export { memoryStorage };
