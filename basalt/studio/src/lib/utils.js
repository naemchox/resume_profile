import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's class merger. Keeps 21st.dev components drop-in compatible. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatCell(v) {
  if (v === null) return { text: 'NULL', muted: true };
  if (v === undefined) return { text: '', muted: true };
  if (typeof v === 'boolean') return { text: String(v), muted: false };
  if (typeof v === 'object') return { text: JSON.stringify(v), muted: false };
  return { text: String(v), muted: false };
}

export function relativeTime(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
