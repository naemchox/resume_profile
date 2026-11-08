import { useEffect, useState } from 'react';
import { Boxes, Plus, Trash2, KeyRound, Copy, Check, ShieldAlert } from 'lucide-react';
import { projectsApi, getAdminKey, setAdminKey } from '../lib/api';
import { relativeTime } from '../lib/utils';
import { Panel, PanelHeader, Badge, Button, Input, EmptyState, Skeleton } from '../components/ui';

function CopyField({ label, value, secret }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(!secret);
  const display = show ? value : value.replace(/.(?=.{4})/g, '•');
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-muted">{label}</label>
      <div className="flex items-center gap-1.5">
        <code
          className="min-w-0 flex-1 truncate rounded border border-border bg-bg px-2 py-1.5 font-mono text-[11.5px]"
          title={show ? value : 'hidden'}
        >
          {display}
        </code>
        {secret && (
          <Button size="xs" variant="ghost" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</Button>
        )}
        <Button
          size="xs" variant="ghost"
          onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function AdminGate({ onReady, notify }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setAdminKey(value);
    try { await projectsApi.list(); onReady(); }
    catch (err) { notify(err.status === 403 ? 'That admin key was rejected.' : err.message); setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-md p-6">
      <Panel className="p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-accent"><Boxes className="h-4.5 w-4.5" /></div>
          <div>
            <h1 className="text-base font-semibold">Projects</h1>
            <p className="text-xs text-muted">Provider control plane</p>
          </div>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted">
          Managing projects needs the <span className="font-mono text-fg">admin key</span> — the provider-level
          credential printed on server start (and in <span className="font-mono text-fg">.data/admin-key</span>).
          It sits above every project's service key.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Input id="admin-key" label="Admin key" type="password" placeholder="ak_…" className="font-mono"
            value={value} onChange={(e) => setValue(e.target.value)} />
          <Button type="submit" variant="accent" className="w-full" disabled={busy || !value.trim()}>
            {busy ? 'Checking…' : 'Unlock projects'}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

export default function Projects({ notify }) {
  const [unlocked, setUnlocked] = useState(!!getAdminKey());
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  const load = () => {
    setLoading(true);
    projectsApi.list()
      .then((p) => setProjects(p))
      .catch((err) => { if (err.status === 403) setUnlocked(false); else notify(err.message); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (unlocked) load(); /* eslint-disable-next-line */ }, [unlocked]);

  if (!unlocked) return <AdminGate onReady={() => setUnlocked(true)} notify={notify} />;

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const p = await projectsApi.create(name.trim());
      setJustCreated(p);
      setName('');
      notify(`Created project "${p.name}"`, 'accent');
      load();
    } catch (err) { notify(err.message); }
    finally { setCreating(false); }
  }

  async function remove(p) {
    if (p.id === 'default') return;
    if (!confirm(`Delete project "${p.name}"? This drops its schema, data, and users irreversibly.`)) return;
    try { await projectsApi.remove(p.id); notify(`Deleted "${p.name}"`, 'accent'); load(); }
    catch (err) { notify(err.message); }
  }

  const origin = location.origin;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="mt-0.5 text-sm text-muted">
            Each project is an isolated tenant — its own schema, users, and keys. Hand a customer their
            publishable key and they connect a client app; nothing crosses between projects.
          </p>
        </div>
        <Button variant="accent" size="sm" onClick={() => setCreating((c) => !c)}>
          <Plus className="h-3.5 w-3.5" /> New project
        </Button>
      </header>

      {creating && (
        <Panel className="p-4">
          <form onSubmit={create} className="flex items-end gap-3">
            <Input id="proj-name" label="Project name" placeholder="Acme Production"
              value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="accent" size="sm" disabled={!name.trim() || creating}>Create</Button>
          </form>
        </Panel>
      )}

      {justCreated && (
        <Panel className="border-accent/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent"><KeyRound className="h-3 w-3" /> new project</Badge>
            <span className="text-sm font-medium">{justCreated.name}</span>
          </div>
          <p className="mb-3 text-xs text-muted">
            Give the client app this config. The service key is for that project's server-side / Studio use only.
          </p>
          <pre className="mb-3 overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-[11.5px] leading-relaxed">
{`const basalt = createClient({
  url: '${origin}',
  key: '${justCreated.publishable_key}',
});`}
          </pre>
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyField label="Publishable key (client)" value={justCreated.publishable_key} />
            <CopyField label="Service key (server only)" value={justCreated.service_key} secret />
          </div>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader title="All projects" subtitle={`${projects.length} total`} />
        {loading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : projects.length === 0 ? (
          <EmptyState icon={Boxes} title="No projects yet" body="Create one to hand a customer their own isolated backend." />
        ) : (
          <ul className="divide-y divide-border">
            {projects.map((p) => (
              <li key={p.id} className="space-y-3 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="font-mono text-[11px] text-muted">{p.schema}</span>
                    {p.id === 'default' && <Badge tone="info">default</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted">{relativeTime(p.created_at)}</span>
                    {p.id !== 'default' && (
                      <Button size="xs" variant="danger" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CopyField label="Publishable key" value={p.publishable_key} />
                  {p.service_key && <CopyField label="Service key" value={p.service_key} secret />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex gap-3 rounded-lg border border-warn/30 bg-warn/8 p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted">
          A new project starts empty. Define its tables and rules by switching the Studio to that project's
          <span className="font-mono text-fg"> service key</span> and using the SQL editor, then hand the
          <span className="font-mono text-fg"> publishable key</span> to the client app.
        </p>
      </div>
    </div>
  );
}
