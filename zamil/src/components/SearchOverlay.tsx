import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import Photo from './Photo'
import { PRODUCTS, priceLabel } from '../data'
import { useEscape, useScrollLock } from '../hooks/useReveal'

type Props = {
  open: boolean
  onClose: () => void
  onAdd: (id: string) => void
}

export default function SearchOverlay({ open, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useScrollLock(open)
  useEscape(open, onClose)

  useEffect(() => {
    if (open) {
      setQuery('')
      // Wait for the panel transition to start before stealing focus.
      const id = window.setTimeout(() => inputRef.current?.focus(), 120)
      return () => window.clearTimeout(id)
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    // Name and blurb alone meant a cannabis shop's search returned nothing for
    // "sativa" or "beer" — the two words a visitor is most likely to type. The
    // category and the drink board's own group heading are searchable too.
    return PRODUCTS.filter((p) =>
      [p.name, p.blurb, p.category, p.group ?? ''].some((field) =>
        field.toLowerCase().includes(q),
      ),
    )
  }, [query])

  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-night/95 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        className={`relative mx-auto w-full max-w-2xl px-6 pt-28 transition-all duration-300 ${
          open ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between">
          <label htmlFor="site-search" className="eyebrow">
            Search the store
          </label>
          <button
            onClick={onClose}
            aria-label="Close search"
            className="text-cream/60 transition-colors hover:text-gold"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 border-b border-cream/25 pb-4 focus-within:border-gold">
          <Search className="h-5 w-5 shrink-0 text-gold" />
          <input
            id="site-search"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “sativa” or “lemon”…"
            className="w-full bg-transparent font-serif text-2xl text-cream outline-none placeholder:text-cream/30"
          />
        </div>

        <div className="mt-6 max-h-[50vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <p className="py-8 text-center text-sm text-cream/50">
              Nothing matches “{query.trim()}”.
            </p>
          )}

          <ul className="space-y-2">
            {results.map((p) => (
              <li key={p.id}>
                <div className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-cream/5">
                  <Photo name={p.img} alt={p.name} className="h-14 w-14 shrink-0 rounded-lg" />
                  <div className="flex-1">
                    <h3 className="font-serif text-sm text-cream">{p.name}</h3>
                    <p className="text-xs text-gold">{priceLabel(p)}</p>
                  </div>
                  <button
                    onClick={() => {
                      onAdd(p.id)
                      onClose()
                    }}
                    className="rounded-full border border-cream/25 px-4 py-2 text-[10px] uppercase tracking-widest text-cream transition-colors hover:border-gold hover:text-gold"
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
