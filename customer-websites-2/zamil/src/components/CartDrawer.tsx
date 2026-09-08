import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import Photo from './Photo'
import { useEscape, useScrollLock } from '../hooks/useReveal'
import type { Cart } from '../hooks/useCart'
import { baht, priceLabel } from '../data'

type Props = {
  open: boolean
  onClose: () => void
  cart: Cart
  onCheckout: () => void
}

export default function CartDrawer({ open, onClose, cart, onCheckout }: Props) {
  useScrollLock(open)
  useEscape(open, onClose)

  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your list"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-night-soft shadow-2xl transition-transform duration-400 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-cream/10 px-6 py-5">
          <h2 className="font-serif text-xl text-cream">
            Your list{cart.count > 0 && <span className="text-gold"> ({cart.count})</span>}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close list"
            className="text-cream/60 transition-colors hover:text-gold"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <ShoppingBag className="h-10 w-10 text-cream/25" />
            <p className="text-sm text-cream/50">Your list is empty.</p>
            <button onClick={onClose} className="btn-outline">
              Browse the menu
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-6 py-4">
              {cart.lines.map((line) => (
                <li key={line.id} className="flex gap-4 border-b border-cream/10 py-4 last:border-0">
                  <Photo
                    name={line.product.img}
                    alt={line.product.name}
                    className="h-20 w-20 shrink-0 rounded-lg"
                  />

                  <div className="flex-1">
                    <h3 className="font-serif text-sm text-cream">{line.product.name}</h3>
                    <p className="mt-1 text-xs text-gold">{priceLabel(line.product)}</p>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex items-center rounded-full border border-cream/20">
                        <button
                          onClick={() => cart.setQty(line.id, line.qty - 1)}
                          aria-label={`Decrease ${line.product.name} quantity`}
                          className="px-2 py-1 text-cream/70 transition-colors hover:text-gold"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="min-w-6 text-center text-xs text-cream">{line.qty}</span>
                        <button
                          onClick={() => cart.setQty(line.id, line.qty + 1)}
                          aria-label={`Increase ${line.product.name} quantity`}
                          className="px-2 py-1 text-cream/70 transition-colors hover:text-gold"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => cart.remove(line.id)}
                        aria-label={`Remove ${line.product.name}`}
                        className="text-cream/40 transition-colors hover:text-[#E0736B]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <span className="text-sm text-cream">
                    {baht(line.product.price * line.qty)}
                  </span>
                </li>
              ))}
            </ul>

            <footer className="border-t border-cream/10 px-6 py-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cream/60">Estimated total</span>
                <span className="font-serif text-xl text-cream">{baht(cart.subtotal)}</span>
              </div>
              <p className="mt-1 text-[10px] text-cream/40">
                Counter prices. Bring this list with you — we don't take online orders.
              </p>
              <button onClick={onCheckout} className="btn-gold mt-4 w-full">
                Where to bring this
              </button>
              <button
                onClick={cart.clear}
                className="mt-3 w-full text-[10px] uppercase tracking-widest text-cream/40 transition-colors hover:text-cream/70"
              >
                Clear list
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
