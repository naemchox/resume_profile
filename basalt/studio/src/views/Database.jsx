import { useEffect, useMemo, useState } from 'react';
import {
  Home, ChevronRight, Plus, Database as DbIcon, FileText, Folder,
  MoreVertical, Trash2, Play, ShieldCheck, Filter, X, Check, KeyRound,
} from 'lucide-react';
import { api, data as restData } from '../lib/api';
import { cn, formatCell } from '../lib/utils';
import { Button, CodeEditor, Select, EmptyState, Skeleton, DataGrid } from '../components/ui';

/* ============================================================= *
 * Firestore-style data browser.
 * tables = collections · rows = documents · columns = fields
 * ============================================================= */

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

function parseValue(type, raw) {
  if (raw === '') return null;
  const t = (type || '').toLowerCase();
  if (t.includes('bool')) return raw === 'true' || raw === 't' || raw === '1';
  if (t.includes('int') || t.includes('numeric') || t.includes('real') || t.includes('double')) {
    const n = Number(raw); return Number.isNaN(n) ? raw : n;
  }
  if (t.includes('json')) { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

// One Miller column: a header, an accent "+" action, and a scrollable list.
function Column({ icon: Icon, title, subtitle, action, children, width = 'w-72', menu }) {
  return (
    <div className={cn('flex min-h-0 shrink-0 flex-col border-r border-border', width)}>
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
        <span className="truncate font-mono text-[13px] font-medium">{title}</span>
        {subtitle && <span className="truncate text-[11px] text-muted">{subtitle}</span>}
        {menu && <div className="ml-auto">{menu}</div>}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-[13px] text-accent transition-colors hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5" /> {action.label}
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function ListRow({ label, selected, onClick, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors',
        selected ? 'bg-accent/12 text-fg' : 'text-fg/90 hover:bg-surface-2',
      )}
    >
      {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-accent' : 'text-muted')} />}
      <span className="truncate font-mono">{label}</span>
      <ChevronRight className={cn('ml-auto h-3.5 w-3.5 shrink-0', selected ? 'text-accent' : 'text-muted/50')} />
    </button>
  );
}

function DataBrowser({ notify }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [activeDocKey, setActiveDocKey] = useState(null);

  const [newColl, setNewColl] = useState(null);       // collection-name input
  const [adding, setAdding] = useState(false);        // add-document form
  const [addForm, setAddForm] = useState({});
  const [editField, setEditField] = useState(null);   // { col, value }
  const [confirmDel, setConfirmDel] = useState(false);
  const [newField, setNewField] = useState(null);     // { name, type }

  const loadTables = () =>
    api.tables().then((t) => setTables(t)).catch((e) => notify(e.message)).finally(() => setLoading(false));
  useEffect(() => { loadTables(); /* eslint-disable-next-line */ }, []);

  const table = tables.find((t) => t.name === activeTable) || null;
  const pkCol = table?.primary_key?.[0] || table?.columns?.[0]?.name;
  const docKey = (row) => (pkCol != null ? row[pkCol] : JSON.stringify(row));
  const activeDoc = docs.find((d) => String(docKey(d)) === String(activeDocKey)) || null;

  function openTable(name) {
    setActiveTable(name);
    setActiveDocKey(null);
    setAdding(false); setEditField(null); setNewField(null);
    setLoadingDocs(true);
    restData.rows(name)
      .then((rows) => setDocs(rows))
      .catch((e) => { notify(e.message); setDocs([]); })
      .finally(() => setLoadingDocs(false));
  }
  const reloadDocs = () => activeTable && restData.rows(activeTable).then(setDocs).catch((e) => notify(e.message));

  async function createCollection() {
    const name = slug(newColl);
    if (!name) return;
    try {
      // Default-deny, exactly like Firestore: RLS on, no policy yet.
      await api.query(`
        create table "${name}" (id bigserial primary key, created_at timestamptz not null default now());
        alter table "${name}" enable row level security;
        grant select, insert, update, delete on "${name}" to authenticated;
        grant usage on sequence "${name}_id_seq" to authenticated;`);
      setNewColl(null);
      await loadTables();
      openTable(name);
      notify(`Created collection "${name}"`, 'accent');
    } catch (e) { notify(e.message); }
  }

  async function addDocument() {
    const values = {};
    for (const [k, v] of Object.entries(addForm)) {
      if (v === '' || v == null) continue;
      const col = table.columns.find((c) => c.name === k);
      values[k] = parseValue(col?.type, v);
    }
    try {
      const [row] = await restData.insert(activeTable, values);
      setAdding(false); setAddForm({});
      await reloadDocs();
      if (row) setActiveDocKey(String(docKey(row)));
      notify('Document added', 'accent');
    } catch (e) { notify(e.message); }
  }

  async function saveField() {
    const col = table.columns.find((c) => c.name === editField.col);
    try {
      await restData.update(activeTable, `${pkCol}=eq.${encodeURIComponent(activeDocKey)}`,
        { [editField.col]: parseValue(col?.type, editField.value) });
      setEditField(null);
      await reloadDocs();
      notify('Field updated', 'accent');
    } catch (e) { notify(e.message); }
  }

  async function addColumn() {
    const name = slug(newField.name);
    if (!name) return;
    try {
      await api.query(`alter table "${activeTable}" add column "${name}" ${newField.type}`);
      setNewField(null);
      await loadTables();
      notify(`Field "${name}" added`, 'accent');
    } catch (e) { notify(e.message); }
  }

  async function deleteDocument() {
    try {
      await restData.remove(activeTable, `${pkCol}=eq.${encodeURIComponent(activeDocKey)}`);
      setConfirmDel(false); setActiveDocKey(null);
      await reloadDocs();
      notify('Document deleted', 'accent');
    } catch (e) { notify(e.message); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-[13px] text-muted">
        <Home className="h-3.5 w-3.5" />
        {activeTable && <><ChevronRight className="h-3 w-3" /><span className="font-mono text-fg">{activeTable}</span></>}
        {activeDoc && <><ChevronRight className="h-3 w-3" /><span className="max-w-40 truncate font-mono text-fg">{String(activeDocKey)}</span></>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ---------- collections ---------- */}
        <Column icon={DbIcon} title="(project)" action={{ label: 'Start collection', onClick: () => setNewColl('') }}>
          {newColl != null && (
            <form className="flex gap-1 border-b border-border p-2" onSubmit={(e) => { e.preventDefault(); createCollection(); }}>
              <input autoFocus value={newColl} onChange={(e) => setNewColl(e.target.value)} placeholder="collection id"
                className="h-8 w-full rounded border border-border bg-bg px-2 font-mono text-[12px]" />
              <Button size="xs" variant="accent" type="submit">Save</Button>
              <Button size="xs" variant="ghost" onClick={() => setNewColl(null)} type="button" aria-label="Cancel"><X className="h-3.5 w-3.5" /></Button>
            </form>
          )}
          {loading ? (
            <div className="space-y-1.5 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : tables.length === 0 ? (
            <p className="p-4 text-[12px] text-muted">No collections yet.</p>
          ) : tables.map((t) => (
            <ListRow key={t.name} icon={Folder} label={t.name} selected={activeTable === t.name} onClick={() => openTable(t.name)} />
          ))}
        </Column>

        {/* ---------- documents ---------- */}
        {table ? (
          <Column
            icon={Folder} title={table.name}
            action={{ label: 'Add document', onClick: () => { setAdding(true); setAddForm({}); } }}
            menu={
              <span className="rounded px-1.5 py-0.5 text-[11px] text-muted" title={`${table.rls_enabled ? 'RLS on' : 'RLS off'}`}>
                {docs.length}
              </span>
            }
          >
            {adding && (
              <form className="space-y-1.5 border-b border-border bg-surface-2/40 p-2" onSubmit={(e) => { e.preventDefault(); addDocument(); }}>
                {table.columns
                  .filter((c) => !(table.primary_key.includes(c.name) && /int/.test(c.type)) && c.name !== 'created_at')
                  .map((c) => (
                    <div key={c.name}>
                      <label className="mb-0.5 block font-mono text-[10px] text-muted">{c.name} <span className="opacity-60">{c.type}</span></label>
                      <input
                        value={addForm[c.name] ?? ''} onChange={(e) => setAddForm((f) => ({ ...f, [c.name]: e.target.value }))}
                        className="h-8 w-full rounded border border-border bg-bg px-2 font-mono text-[12px]" />
                    </div>
                  ))}
                <div className="flex gap-1.5 pt-1">
                  <Button size="xs" variant="accent" type="submit">Add</Button>
                  <Button size="xs" variant="ghost" type="button" onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              </form>
            )}
            {loadingDocs ? (
              <div className="space-y-1.5 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : docs.length === 0 ? (
              <p className="p-4 text-[12px] text-muted">No documents.</p>
            ) : docs.map((d) => (
              <ListRow key={String(docKey(d))} icon={FileText} label={String(docKey(d))}
                selected={String(activeDocKey) === String(docKey(d))} onClick={() => { setActiveDocKey(String(docKey(d))); setEditField(null); setConfirmDel(false); }} />
            ))}
          </Column>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={DbIcon} title="Select a collection" body="Pick a collection on the left, or start a new one." />
          </div>
        )}

        {/* ---------- fields (document) ---------- */}
        {activeDoc && (
          <Column
            icon={FileText} title={String(activeDocKey)} width="flex-1"
            action={{ label: 'Add field', onClick: () => setNewField({ name: '', type: 'text' }) }}
            menu={
              confirmDel ? (
                <span className="flex items-center gap-1">
                  <Button size="xs" variant="danger" onClick={deleteDocument}>Delete</Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button>
                </span>
              ) : (
                <Button size="xs" variant="ghost" onClick={() => setConfirmDel(true)} aria-label="Delete document"><Trash2 className="h-3.5 w-3.5" /></Button>
              )
            }
          >
            {newField && (
              <form className="flex flex-wrap gap-1.5 border-b border-border bg-surface-2/40 p-2" onSubmit={(e) => { e.preventDefault(); addColumn(); }}>
                <input autoFocus placeholder="field name" value={newField.name} onChange={(e) => setNewField((f) => ({ ...f, name: e.target.value }))}
                  className="h-8 flex-1 rounded border border-border bg-bg px-2 font-mono text-[12px]" />
                <select value={newField.type} onChange={(e) => setNewField((f) => ({ ...f, type: e.target.value }))}
                  className="h-8 rounded border border-border bg-bg px-1 text-[12px]">
                  {['text', 'integer', 'bigint', 'boolean', 'timestamptz', 'jsonb', 'uuid', 'numeric'].map((t) => <option key={t}>{t}</option>)}
                </select>
                <Button size="xs" variant="accent" type="submit">Add</Button>
                <Button size="xs" variant="ghost" type="button" onClick={() => setNewField(null)}><X className="h-3.5 w-3.5" /></Button>
              </form>
            )}
            <ul className="divide-y divide-border/60">
              {table.columns.map((c) => {
                const val = activeDoc[c.name];
                const editing = editField?.col === c.name;
                const isPk = table.primary_key.includes(c.name);
                const { text, muted } = formatCell(val);
                return (
                  <li key={c.name} className="px-4 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[12.5px] text-info">{c.name}</span>
                      {isPk && <KeyRound className="h-3 w-3 text-warn" aria-label="primary key" />}
                      <span className="font-mono text-[10px] text-muted">{c.type}</span>
                    </div>
                    {editing ? (
                      <form className="mt-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); saveField(); }}>
                        <input autoFocus value={editField.value} onChange={(e) => setEditField((f) => ({ ...f, value: e.target.value }))}
                          className="h-8 flex-1 rounded border border-accent bg-bg px-2 font-mono text-[12px]" />
                        <Button size="xs" variant="accent" type="submit"><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="xs" variant="ghost" type="button" onClick={() => setEditField(null)}><X className="h-3.5 w-3.5" /></Button>
                      </form>
                    ) : (
                      <button
                        disabled={isPk}
                        onClick={() => setEditField({ col: c.name, value: val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val)) })}
                        className={cn('mt-0.5 block w-full truncate text-left font-mono text-[13px]',
                          muted ? 'text-muted italic' : 'text-fg', !isPk && 'rounded px-1 -mx-1 hover:bg-surface-2 cursor-text')}
                        title={isPk ? 'primary key' : 'click to edit'}
                      >
                        {text}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Column>
        )}
      </div>
    </div>
  );
}

/* ============================================================= *
 * Firestore-style Rules editor (RLS policies) + Rules Playground
 * ============================================================= */

function reconstruct(policies) {
  if (!policies.length) {
    return `-- No policies yet. With row-level security on and no policy,
-- Postgres denies every row by default — same as Firestore's:
--   allow read, write: if false;
--
-- Grant access by writing a policy, then Publish:
--
-- create policy "owners read their rows" on your_table
--   for select to authenticated
--   using (owner = auth.uid());`;
  }
  return policies.map((p) => {
    const roles = Array.isArray(p.roles) ? p.roles.join(', ') : p.roles;
    let s = `create policy "${p.name}" on ${p.schema}.${p.table}\n  for ${String(p.cmd).toLowerCase()} to ${roles}`;
    if (p.qual) s += `\n  using (${p.qual})`;
    if (p.with_check) s += `\n  with check (${p.with_check})`;
    return s + ';';
  }).join('\n\n');
}

function Rules({ notify }) {
  const [policies, setPolicies] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);

  // playground state
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState('authenticated');
  const [userId, setUserId] = useState('');
  const [sql, setSql] = useState('select * from ');
  const [result, setResult] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.policies(), api.users()])
      .then(([p, u]) => { setPolicies(p); setText(reconstruct(p)); setUsers(u); setUserId((x) => x || u[0]?.id || ''); })
      .catch((e) => notify(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line

  async function publish() {
    setPublishing(true);
    try {
      // Idempotent publish: drop each named policy before recreating it, so
      // hitting Publish repeatedly just replaces the rules (Firestore-like).
      const drops = [...text.matchAll(/create\s+policy\s+("[^"]+"|\S+)\s+on\s+(\S+)/gi)]
        .map((m) => `drop policy if exists ${m[1]} on ${m[2]};`).join('\n');
      await api.query(`${drops}\n${text}`);
      notify('Rules published', 'accent');
      load();
    } catch (e) { notify(e.message); }
    finally { setPublishing(false); }
  }

  async function runPlayground() {
    const u = users.find((x) => x.id === userId);
    const claims = role === 'authenticated' && u
      ? { sub: u.id, email: u.email, role: 'authenticated', app_metadata: u.app_metadata }
      : { role };
    try { setResult(await api.simulate({ sql: sql.replace(/;\s*$/, ''), role, claims })); }
    catch (e) { notify(e.message); }
  }

  const user = users.find((u) => u.id === userId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-[13px] text-muted">Rules decide who can read and write each row — enforced by Postgres, not the client.</p>
        <Button size="sm" variant="accent" onClick={publish} disabled={publishing || loading}>
          {publishing ? 'Publishing…' : 'Publish'}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_260px]">
        {/* editor */}
        <div className="flex min-h-0 flex-col border-r border-border">
          {loading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div>
            : <CodeEditor value={text} onChange={setText} rows={22} ariaLabel="Security rules" onRun={publish} />}
        </div>

        {/* helper rail */}
        <aside className="min-h-0 overflow-y-auto p-4">
          <div className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-warn/15">
            <ShieldCheck className="h-7 w-7 text-warn" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold">Guard your data with rules</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Define who has access and how it's structured. Rules here are Postgres row-level security policies —
            the same language your app is governed by.
          </p>
          <Button size="sm" variant="default" className="mt-4 w-full" onClick={() => setShowPlayground((s) => !s)}>
            <Play className="h-3.5 w-3.5" /> Rules Playground
          </Button>
        </aside>
      </div>

      {/* playground */}
      {showPlayground && (
        <div className="border-t border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Play className="h-3.5 w-3.5 text-accent" />
            <span className="text-[13px] font-medium">Rules Playground</span>
            <span className="text-[11px] text-muted">— run a query as any identity; writes roll back</span>
            <button className="ml-auto text-muted hover:text-fg" onClick={() => setShowPlayground(false)} aria-label="Close playground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-[180px_1fr_auto] md:items-end">
            <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="anon">anon</option>
              <option value="authenticated">authenticated</option>
              <option value="service_role">service_role</option>
            </Select>
            <div>
              <Select label="Acting as" value={userId} onChange={(e) => setUserId(e.target.value)} disabled={role !== 'authenticated'}>
                {users.length === 0 && <option value="">no users</option>}
                {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
              </Select>
            </div>
            <Button variant="accent" onClick={runPlayground}><Play className="h-3.5 w-3.5" /> Run</Button>
          </div>
          {role === 'authenticated' && user && (
            <p className="px-4 pb-2 font-mono text-[11px] text-muted">auth.uid() = <span className="text-accent">{user.id}</span></p>
          )}
          <div className="px-4 pb-3">
            <CodeEditor value={sql} onChange={setSql} rows={3} ariaLabel="Playground query" onRun={runPlayground} />
          </div>
          {result && (
            <div className="border-t border-border px-4 py-3">
              {!result.allowed ? (
                <p className="font-mono text-[12px] text-danger">Rejected — {result.error}</p>
              ) : result.row_count === 0 ? (
                <p className="flex items-center gap-1.5 text-[12px] text-muted"><Filter className="h-3.5 w-3.5 text-info" /> Allowed, but every row was filtered by a USING clause. This is what another tenant sees.</p>
              ) : (
                <DataGrid maxHeight="14rem" columns={result.fields} rows={result.rows}
                  renderCell={(r, c) => { const { text: tx, muted } = formatCell(r[c]); return <span className={muted ? 'text-muted italic' : ''}>{tx}</span>; }} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================= *
 * Database view: Data | Rules tabs, Firestore-style.
 * ============================================================= */
const TABS = [{ id: 'data', label: 'Data' }, { id: 'rules', label: 'Rules' }];

export default function Database({ notify }) {
  const [tab, setTab] = useState('data');
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end gap-1 border-b border-border px-4 pt-3">
        <h1 className="mr-4 pb-2 text-base font-semibold">Database</h1>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn('border-b-2 px-3 pb-2 text-[13px] transition-colors',
              tab === t.id ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}
          >
            {t.label}
          </button>
        ))}
        <button disabled className="cursor-not-allowed border-b-2 border-transparent px-3 pb-2 text-[13px] text-muted/40">Indexes</button>
      </div>
      {tab === 'data' ? <DataBrowser notify={notify} /> : <Rules notify={notify} />}
    </div>
  );
}
