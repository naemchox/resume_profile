import { useState } from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { formatCell } from '../lib/utils';
import { Panel, PanelHeader, Button, CodeEditor, DataGrid, Badge } from '../components/ui';

const SNIPPETS = [
  {
    label: 'Table with RLS',
    sql: `create table posts (
  id         bigserial primary key,
  author_id  uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  published  boolean not null default false,
  created_at timestamptz not null default now()
);

alter table posts enable row level security;

-- GRANT and POLICY are separate layers. Both are required.
grant select, insert, update, delete on posts to authenticated;
grant select on posts to anon;
grant usage on sequence posts_id_seq to authenticated;

create policy "anyone reads published posts" on posts
  for select to anon, authenticated
  using (published);

create policy "authors manage their own posts" on posts
  for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Opt the table into the realtime change stream.
select realtime.enable('public.posts');`,
  },
  {
    label: 'Inspect policies',
    sql: `select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;`,
  },
  {
    label: 'Find tables missing RLS',
    sql: `select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;`,
  },
];

export default function SqlEditor({ notify }) {
  const [sql, setSql] = useState(SNIPPETS[0].sql);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy || !sql.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.query(sql));
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">SQL editor</h1>
          <p className="mt-0.5 text-sm text-muted">Runs as superuser. Not subject to row level security.</p>
        </div>
        <div className="flex items-center gap-2">
          {SNIPPETS.map((s) => (
            <Button key={s.label} size="xs" variant="ghost" onClick={() => { setSql(s.sql); setResult(null); setError(null); }}>
              {s.label}
            </Button>
          ))}
        </div>
      </header>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Query"
          subtitle="Cmd/Ctrl + Enter to run"
          actions={
            <Button size="sm" variant="accent" onClick={run} disabled={busy || !sql.trim()}>
              <Play className="h-3.5 w-3.5" />
              {busy ? 'Running…' : 'Run'}
            </Button>
          }
        />
        <CodeEditor value={sql} onChange={setSql} onRun={run} rows={14} ariaLabel="SQL query" />
      </Panel>

      <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PanelHeader
          title="Result"
          actions={
            result && (
              <Badge tone="accent">
                {result.rows.length} row{result.rows.length === 1 ? '' : 's'} · {result.statements} stmt · {result.duration_ms}ms
              </Badge>
            )
          }
        />

        {error ? (
          <div role="alert" className="flex items-start gap-2.5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <pre className="font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-danger">{error}</pre>
          </div>
        ) : !result ? (
          <div className="flex items-center justify-center px-4 py-12 text-sm text-muted">
            Run a query to see results.
          </div>
        ) : result.fields.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-accent">
            Statement executed successfully. No rows returned.
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <DataGrid
              columns={result.fields}
              rows={result.rows}
              renderCell={(row, c) => {
                const { text, muted } = formatCell(row[c]);
                return <span className={muted ? 'text-muted italic' : 'text-fg'} title={text}>{text}</span>;
              }}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
