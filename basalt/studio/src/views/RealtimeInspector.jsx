import { useEffect, useRef, useState, useCallback } from 'react';
import { Radio, Pause, Play, Trash2, Zap, ZapOff } from 'lucide-react';
import { api, openRealtimeInspector } from '../lib/api';
import { cn } from '../lib/utils';
import { Panel, PanelHeader, Badge, Button, EmptyState, Skeleton } from '../components/ui';

const OP_TONE = { INSERT: 'accent', UPDATE: 'warn', DELETE: 'danger' };
const MAX_EVENTS = 200; // bounded: an unbounded feed is a memory leak

export default function RealtimeInspector({ notify }) {
  const [tables, setTables] = useState([]);
  const [enabled, setEnabled] = useState([]);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('disconnected');
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const load = useCallback(() => {
    Promise.all([api.tables(), api.realtimeTables()])
      .then(([t, r]) => { setTables(t.filter((x) => x.schema === 'public')); setEnabled(r); })
      .catch((e) => notify(e.message))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(load, [load]);

  // Reconnect whenever the enabled set changes.
  useEffect(() => {
    if (!enabled.length) { setStatus('disconnected'); return; }
    const close = openRealtimeInspector(
      enabled,
      (payload) => {
        if (pausedRef.current) return;
        setEvents((prev) => [{ ...payload, _rx: Date.now() }, ...prev].slice(0, MAX_EVENTS));
      },
      (s, msg) => { setStatus(s); if (msg) notify(msg); },
    );
    return close;
  }, [enabled, notify]);

  async function toggle(t) {
    const on = enabled.some((e) => e.table === t.name && e.schema === t.schema);
    try {
      if (on) await api.disableRealtime(t.schema, t.name);
      else await api.enableRealtime(t.schema, t.name);
      load();
    } catch (e) { notify(e.message); }
  }

  const statusTone = status === 'connected' ? 'accent' : status === 'error' ? 'danger' : 'muted';

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-auto border-r border-border">
        <div className="border-b border-border px-3 py-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Change stream</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Enabling attaches a trigger that writes into the durable changelog.
          </p>
        </div>
        {loading ? (
          <div className="space-y-1.5 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <ul className="p-1.5">
            {tables.map((t) => {
              const on = enabled.some((e) => e.table === t.name && e.schema === t.schema);
              return (
                <li key={t.name}>
                  <button
                    onClick={() => toggle(t)}
                    aria-pressed={on}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-left',
                      'transition-colors duration-200 hover:bg-surface-2/60',
                    )}
                  >
                    <span className={cn('truncate font-mono text-[12.5px]', on ? 'text-fg' : 'text-muted')}>{t.name}</span>
                    {on
                      ? <Zap className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="enabled" />
                      : <ZapOff className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="disabled" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col p-6">
        <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PanelHeader
            title="Live events"
            subtitle="Connected as service_role, so every change is visible. A user's socket only receives rows their policies allow."
            actions={
              <>
                <Badge tone={statusTone}>
                  <span className={cn('h-1.5 w-1.5 rounded-full bg-current', status === 'connected' && 'pulse-dot')} />
                  {status}
                </Badge>
                <Button size="xs" variant="ghost" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {paused ? 'Resume' : 'Pause'}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setEvents([])} aria-label="Clear event feed">
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </>
            }
          />

          <div className="min-h-0 flex-1 overflow-auto">
            {!enabled.length ? (
              <EmptyState icon={Radio} title="No tables are streaming"
                body="Enable a table on the left to attach its change trigger." />
            ) : !events.length ? (
              <EmptyState icon={Radio} title="Listening…"
                body="Insert, update or delete a row and it will appear here within a moment." />
            ) : (
              <ul className="divide-y divide-border font-mono text-[12px]">
                {events.map((e) => (
                  <li key={`${e.commit_id}`} className="flash px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={OP_TONE[e.eventType]}>{e.eventType}</Badge>
                      <span className="text-fg">{e.schema}.{e.table}</span>
                      <span className="text-muted">#{e.commit_id}</span>
                      <span className="ml-auto text-[11px] text-muted">
                        {new Date(e.committed_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="mt-1.5 overflow-x-auto rounded border border-border bg-bg px-2.5 py-1.5 text-[11.5px] leading-relaxed text-muted">
{JSON.stringify(e.eventType === 'DELETE' ? e.old : e.new, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
