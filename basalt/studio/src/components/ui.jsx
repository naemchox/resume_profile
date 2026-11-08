// Primitives, in the shadcn/ui idiom: token-driven, cn()-composable, no Radix.
import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

export function Button({ variant = 'default', size = 'md', className, ...props }) {
  const variants = {
    default: 'bg-surface-2 text-fg border-border hover:bg-border',
    accent: 'bg-accent text-accent-fg border-transparent hover:opacity-90 font-medium',
    ghost: 'bg-transparent text-muted border-transparent hover:bg-surface-2 hover:text-fg',
    danger: 'bg-transparent text-danger border-border hover:bg-danger/10',
  };
  const sizes = {
    // 44px min touch target on the primary sizes; `xs` is desktop-only chrome.
    xs: 'h-7 px-2 text-xs gap-1',
    sm: 'h-9 px-3 text-sm gap-1.5',
    md: 'h-11 px-4 text-sm gap-2',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md border cursor-pointer',
        'transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className,
      )}
      {...props}
    />
  );
}

export function Badge({ tone = 'muted', className, children }) {
  const tones = {
    muted: 'bg-surface-2 text-muted border-border',
    accent: 'bg-accent/12 text-accent border-accent/30',
    danger: 'bg-danger/12 text-danger border-danger/30',
    warn: 'bg-warn/12 text-warn border-warn/30',
    info: 'bg-info/12 text-info border-info/30',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Panel({ className, ...props }) {
  return <div className={cn('rounded-lg border border-border bg-surface', className)} {...props} />;
}

export function PanelHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Input({ className, label, id, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      )}
      <input
        id={id}
        className={cn(
          'h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg',
          'placeholder:text-muted/60 transition-colors duration-200 focus:border-accent',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function Select({ className, label, id, children, ...props }) {
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">{label}</label>}
      <select
        id={id}
        className={cn('h-9 w-full cursor-pointer rounded-md border border-border bg-bg px-2 text-sm text-fg', className)}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

/** Code editor. A textarea with monospace + tab capture, not a fake editor. */
export function CodeEditor({ value, onChange, onRun, placeholder, rows = 10, ariaLabel }) {
  const ref = useRef(null);
  const onKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = ref.current;
      const { selectionStart: s, selectionEnd: t } = el;
      const next = `${value.slice(0, s)}  ${value.slice(t)}`;
      onChange(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onRun?.(); }
  };
  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      value={value}
      rows={rows}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className="w-full resize-none bg-bg p-4 font-mono text-[13px] leading-relaxed text-fg outline-none placeholder:text-muted/50"
    />
  );
}

/**
 * Data grid. Horizontal overflow is contained here, so the page body never
 * scrolls sideways however wide the table gets.
 */
export function DataGrid({ columns, rows, empty = 'No rows', renderCell, rowKey, maxHeight = '100%' }) {
  if (!rows.length) {
    return <div className="flex items-center justify-center px-4 py-12 text-sm text-muted">{empty}</div>;
  }
  return (
    <div className="w-full overflow-auto" style={{ maxHeight }}>
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2 font-mono text-[11px] font-medium tracking-wide text-muted uppercase"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey?.(row, i) ?? i} className="transition-colors duration-150 hover:bg-surface-2/60">
              {columns.map((c) => (
                <td key={c} className="max-w-100 truncate border-b border-border/60 px-3 py-2 font-mono text-[12.5px]">
                  {renderCell(row, c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icon && <Icon className="h-8 w-8 text-muted" aria-hidden="true" />}
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {body && <p className="max-w-sm text-xs leading-relaxed text-muted">{body}</p>}
      {action}
    </div>
  );
}

/** Reserve height so async content does not shove the layout around. */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-surface-2', className)} />;
}

export function Toast({ message, tone = 'danger', onDismiss }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2.5 text-sm shadow-lg',
        tone === 'danger' ? 'border-danger/40 bg-surface text-danger' : 'border-accent/40 bg-surface text-accent',
      )}
    >
      {message}
    </div>
  );
}
