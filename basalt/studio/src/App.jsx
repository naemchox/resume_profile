import { useEffect, useState, useCallback } from 'react';
import {
  Database as DatabaseIcon, LayoutDashboard, Table2, Terminal, Users, Radio, HardDrive, Boxes,
  Sun, Moon, LogOut,
} from 'lucide-react';
import { cn } from './lib/utils';
import { getServiceKey, clearServiceKey } from './lib/api';
import { Button, Toast } from './components/ui';
import KeyGate from './views/KeyGate';
import Overview from './views/Overview';
import Database from './views/Database';
import SqlEditor from './views/SqlEditor';
import UsersView from './views/Users';
import RealtimeInspector from './views/RealtimeInspector';
import StorageView from './views/Storage';
import Projects from './views/Projects';

const NAV = [
  { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
  { id: 'projects',  label: 'Projects',  icon: Boxes },
  { id: 'database',  label: 'Database',  icon: Table2 },
  { id: 'sql',       label: 'SQL',       icon: Terminal },
  { id: 'users',     label: 'Auth',      icon: Users },
  { id: 'realtime',  label: 'Realtime',  icon: Radio },
  { id: 'storage',   label: 'Storage',   icon: HardDrive },
];

export default function App() {
  const [hasKey, setHasKey] = useState(!!getServiceKey());
  const [view, setView] = useState('overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('basalt.theme') ?? 'dark');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('basalt.theme', theme);
  }, [theme]);

  const notify = useCallback((message, tone = 'danger') => setToast({ message, tone }), []);

  if (!hasKey) return <KeyGate onReady={() => setHasKey(true)} />;

  const Current = {
    overview: Overview, projects: Projects, database: Database, sql: SqlEditor,
    users: UsersView, realtime: RealtimeInspector, storage: StorageView,
  }[view];

  return (
    <div className="flex h-full bg-bg text-fg">
      <nav aria-label="Primary" className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="grid h-7 w-7 place-items-center rounded bg-accent" aria-hidden="true">
            <DatabaseIcon className="h-4 w-4 text-accent-fg" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm leading-tight font-semibold">Basalt</div>
            <div className="font-mono text-[10px] leading-tight text-muted">studio</div>
          </div>
        </div>

        <ul className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                onClick={() => setView(id)}
                aria-current={view === id ? 'page' : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                  'transition-colors duration-200',
                  view === id
                    ? 'bg-surface-2 font-medium text-fg'
                    : 'text-muted hover:bg-surface-2/60 hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-border p-2">
          <Button
            size="xs" variant="ghost"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          <Button
            size="xs" variant="ghost"
            onClick={() => { clearServiceKey(); setHasKey(false); }}
            aria-label="Forget service key"
          >
            <LogOut className="h-3.5 w-3.5" />
            Forget key
          </Button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-auto">
        <Current notify={notify} />
      </main>

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}
