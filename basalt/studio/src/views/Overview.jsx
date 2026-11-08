import { useEffect, useState } from 'react';
import { Users, Table2, Radio, HardDrive, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { formatBytes, cn } from '../lib/utils';
import { Panel, PanelHeader, Badge, Skeleton, EmptyState } from '../components/ui';

function StatTile({ icon: Icon, label, value, hint, loading }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      {/* Fixed height reserves space so the number landing does not shift layout. */}
      <div className="mt-2 flex h-9 items-end">
        {loading ? <Skeleton className="h-7 w-16" /> : <span className="font-mono text-3xl leading-none font-semibold tabular-nums">{value}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </Panel>
  );
}

export default function Overview({ notify }) {
  const [stats, setStats] = useState(null);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.stats(), api.tables()])
      .then(([s, t]) => { setStats(s); setTables(t.filter((x) => x.schema === 'public')); })
      .catch((e) => notify(e.message))
      .finally(() => setLoading(false));
  }, [notify]);

  // A public table without RLS is readable by anyone holding the anon key.
  const unprotected = tables.filter((t) => !t.rls_enabled);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="mt-0.5 text-sm text-muted">Postgres, auth, realtime and storage for this project.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} label="Users" value={stats?.users ?? 0} loading={loading} />
        <StatTile icon={Table2} label="Tables" value={tables.length} loading={loading} hint="in schema public" />
        <StatTile icon={Radio} label="Live sockets" value={stats?.realtime_connections ?? 0} loading={loading}
          hint={`${stats?.changelog_size ?? 0} buffered changes`} />
        <StatTile icon={HardDrive} label="Storage" value={formatBytes(stats?.storage_bytes ?? 0)} loading={loading}
          hint={`${stats?.objects ?? 0} objects`} />
      </div>

      <Panel>
        <PanelHeader
          title="Row level security"
          subtitle="Authorization runs in the database. A table without RLS is open to every caller."
          actions={
            unprotected.length > 0
              ? <Badge tone="danger"><ShieldAlert className="h-3 w-3" />{unprotected.length} unprotected</Badge>
              : <Badge tone="accent"><ShieldCheck className="h-3 w-3" />All protected</Badge>
          }
        />
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : tables.length === 0 ? (
          <EmptyState icon={Table2} title="No tables yet" body="Create one from the SQL editor to get started." />
        ) : (
          <ul className="divide-y divide-border">
            {tables.map((t) => (
              <li key={`${t.schema}.${t.name}`} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="truncate font-mono text-[13px]">{t.name}</span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {t.columns.length} cols · {t.row_count ?? '—'} rows
                  </span>
                </div>
                <Badge tone={t.rls_enabled ? 'accent' : 'danger'}>
                  {t.rls_enabled ? 'RLS on' : 'RLS off'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {unprotected.length > 0 && (
        <div className={cn('flex gap-3 rounded-lg border border-danger/30 bg-danger/8 p-4')}>
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="text-xs leading-relaxed">
            <p className="font-medium text-fg">
              {unprotected.length} table{unprotected.length > 1 ? 's have' : ' has'} row level security disabled.
            </p>
            <p className="mt-1 text-muted">
              Any client holding the anon key can read{' '}
              <span className="font-mono text-fg">{unprotected.map((t) => t.name).join(', ')}</span> in full.
              Enable RLS and add a policy, or a single missing statement becomes a data breach.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
