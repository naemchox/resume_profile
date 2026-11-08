import { useEffect, useState } from 'react';
import { Trash2, Users as UsersIcon, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { relativeTime } from '../lib/utils';
import { Panel, PanelHeader, Badge, Button, EmptyState, Skeleton, Input } from '../components/ui';

export default function UsersView({ notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const load = () => {
    setLoading(true);
    api.users().then(setUsers).catch((e) => notify(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [notify]);

  async function removeUser(u) {
    // A destructive, irreversible action: confirm before firing.
    if (!confirm(`Delete ${u.email}? This cascades to every row referencing them.`)) return;
    try { await api.deleteUser(u.id); notify(`Deleted ${u.email}`, 'accent'); load(); }
    catch (e) { notify(e.message); }
  }

  async function saveMetadata(u) {
    let parsed;
    try { parsed = JSON.parse(draft); }
    catch { return notify('app_metadata must be valid JSON'); }
    try {
      await api.setAppMetadata(u.id, parsed);
      notify(`Updated ${u.email}`, 'accent');
      setEditing(null);
      load();
    } catch (e) { notify(e.message); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header>
        <h1 className="text-lg font-semibold">Auth users</h1>
        <p className="mt-0.5 text-sm text-muted">
          <span className="font-mono text-fg">app_metadata</span> is server-controlled and safe to authorize on.{' '}
          <span className="font-mono text-fg">user_metadata</span> is client-writable — never trust it in a policy.
        </p>
      </header>

      <Panel className="overflow-hidden">
        <PanelHeader title="Users" subtitle={`${users.length} registered`} />

        {loading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : users.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users yet" body="Sign one up through /auth/v1/signup or the SDK." />
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{u.email}</span>
                      {u.email_confirmed_at && <Badge tone="accent"><ShieldCheck className="h-2.5 w-2.5" />verified</Badge>}
                      {u.banned_until && <Badge tone="danger">banned</Badge>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted">
                      <span className="truncate">{u.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">last seen {relativeTime(u.last_sign_in_at)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="xs" variant="ghost"
                      onClick={() => {
                        setEditing(editing === u.id ? null : u.id);
                        setDraft(JSON.stringify(u.app_metadata ?? {}, null, 0));
                      }}
                    >
                      app_metadata
                    </Button>
                    <Button size="xs" variant="danger" onClick={() => removeUser(u)} aria-label={`Delete ${u.email}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {editing === u.id && (
                  <div className="mt-3 flex items-end gap-2 rounded-md border border-border bg-bg p-3">
                    <Input
                      id={`meta-${u.id}`}
                      label="app_metadata (JSON)"
                      className="font-mono text-[12px]"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder='{"role":"admin"}'
                    />
                    <Button size="sm" variant="accent" onClick={() => saveMetadata(u)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
