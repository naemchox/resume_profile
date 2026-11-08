import { useEffect, useState } from 'react';
import { HardDrive, Plus, Globe, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { formatBytes, relativeTime } from '../lib/utils';
import { Panel, PanelHeader, Badge, Button, Input, EmptyState, Skeleton, DataGrid } from '../components/ui';

export default function StorageView({ notify }) {
  const [buckets, setBuckets] = useState([]);
  const [objects, setObjects] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const load = () => {
    api.buckets()
      .then((b) => { setBuckets(b); setActive((a) => a ?? b[0]?.id ?? null); })
      .catch((e) => notify(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [notify]);

  useEffect(() => {
    if (!active) return;
    // storage.objects is an ordinary table, so the REST path reads it.
    api.rows('objects').then(() => {}).catch(() => {});
    fetch('/storage/v1/object/list', {
      method: 'POST',
      headers: { apikey: localStorage.getItem('basalt.service_key') ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ bucket: active, prefix: '' }),
    })
      .then((r) => r.json())
      .then((d) => setObjects(Array.isArray(d) ? d : []))
      .catch((e) => notify(e.message));
  }, [active, notify]);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createBucket(name.trim(), isPublic);
      notify(`Created bucket "${name.trim()}"`, 'accent');
      setName(''); setIsPublic(false); setCreating(false);
      load();
    } catch (err) { notify(err.message); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Storage</h1>
          <p className="mt-0.5 text-sm text-muted">
            Permissions are RLS policies on <span className="font-mono text-fg">storage.objects</span> — the same
            language as your data.
          </p>
        </div>
        <Button size="sm" variant="accent" onClick={() => setCreating((c) => !c)}>
          <Plus className="h-3.5 w-3.5" />
          New bucket
        </Button>
      </header>

      {creating && (
        <Panel className="p-4">
          <form onSubmit={create} className="flex items-end gap-3">
            <Input id="bucket-name" label="Bucket name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="avatars" className="font-mono" />
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm whitespace-nowrap">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="cursor-pointer" />
              Public
            </label>
            <Button type="submit" variant="accent" size="sm" disabled={!name.trim()}>Create</Button>
          </form>
          <p className="mt-2 text-[11px] text-muted">
            A public bucket is readable by anyone, including the <span className="font-mono">anon</span> role.
          </p>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_1fr]">
        <Panel className="overflow-hidden">
          <PanelHeader title="Buckets" />
          {loading ? (
            <div className="space-y-1.5 p-2">{[0, 1].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : buckets.length === 0 ? (
            <EmptyState icon={HardDrive} title="No buckets" body="Create one to start uploading." />
          ) : (
            <ul className="p-1.5">
              {buckets.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => setActive(b.id)}
                    aria-current={active === b.id ? 'true' : undefined}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition-colors duration-200 ${
                      active === b.id ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg'
                    }`}
                  >
                    <span className="truncate font-mono text-[12.5px]">{b.id}</span>
                    {b.public
                      ? <Globe className="h-3.5 w-3.5 shrink-0 text-warn" aria-label="public" />
                      : <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="private" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title={active ? <span className="font-mono">{active}</span> : 'Objects'}
            subtitle={`${objects.length} object${objects.length === 1 ? '' : 's'}`}
            actions={
              active && buckets.find((b) => b.id === active)?.public
                ? <Badge tone="warn"><Globe className="h-3 w-3" />public</Badge>
                : <Badge tone="muted"><Lock className="h-3 w-3" />private</Badge>
            }
          />
          <DataGrid
            columns={['name', 'size', 'mime_type', 'created_at']}
            rows={objects}
            empty="No objects in this bucket."
            rowKey={(o) => o.id}
            renderCell={(o, c) => {
              if (c === 'size') return <span className="tabular-nums">{formatBytes(Number(o.size))}</span>;
              if (c === 'created_at') return <span className="text-muted">{relativeTime(o.created_at)}</span>;
              if (c === 'mime_type') return <span className="text-muted">{o.mime_type ?? '—'}</span>;
              return <span title={o.name}>{o.name}</span>;
            }}
          />
        </Panel>
      </div>
    </div>
  );
}
