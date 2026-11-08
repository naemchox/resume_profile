import { useState } from 'react';
import { Database, AlertTriangle } from 'lucide-react';
import { setServiceKey } from '../lib/api';
import { Button, Input, Panel } from '../components/ui';

export default function KeyGate({ onReady }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setServiceKey(value);
    try {
      const res = await fetch('/meta/v1/stats', { headers: { apikey: value.trim() } });
      if (!res.ok) throw new Error('That key was rejected by the server.');
      onReady();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-bg px-6">
      <Panel className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded bg-accent" aria-hidden="true">
            <Database className="h-4.5 w-4.5 text-accent-fg" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base font-semibold">Basalt Studio</h1>
            <p className="text-xs text-muted">Connect with your service key</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input
            id="service-key"
            label="Service key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk_..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
          />

          <div className="flex gap-2.5 rounded-md border border-warn/30 bg-warn/8 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted">
              The service key bypasses row-level security. It is stored only in this
              browser&apos;s localStorage and is never sent anywhere but your own server.
              Never embed it in a client application.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-danger">{error}</p>
          )}

          <Button type="submit" variant="accent" className="w-full" disabled={busy || !value.trim()}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        </form>

        <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
          The server prints the key on start, or reads it from{' '}
          <span className="text-fg">.data/service-key</span>
        </p>
      </Panel>
    </div>
  );
}
