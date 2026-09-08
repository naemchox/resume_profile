import { useEffect, useState } from 'react'
import { Menu, Search, ShoppingBag, X } from 'lucide-react'
import LeafGlyph from './LeafGlyph'
import { BRAND, NAV } from '../data'
import { useEscape, useScrolled, useScrollLock } from '../hooks/useReveal'

type Props = {
  cartCount: number
  onOpenCart: () => void
  onOpenSearch: () => void
}

/** Highlights the nav item whose section is currently on screen. */
function useActiveSection() {
  const [active, setActive] = useState('#top')

  useEffect(() => {
    const ids = NAV.map((n) => n.href.slice(1))
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => Boolean(n))
    if (!nodes.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(`#${visible.target.id}`)
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )

    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [])

  return active
}

export default function Header({ cartCount, onOpenCart, onOpenSearch }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const scrolled = useScrolled(60)
  const active = useActiveSection()

  useScrollLock(menuOpen)
  useEscape(menuOpen, () => setMenuOpen(false))

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'bg-night/90 py-3 shadow-lg shadow-black/40 backdrop-blur-md'
            : 'bg-transparent py-6'
        }`}
      >
        <div className="mx-auto flex w-full max-w-shell items-center justify-between px-6">
          <a
            href="#top"
            className="group flex items-center gap-2 font-serif text-2xl tracking-wide text-cream"
          >
            <LeafGlyph className="h-5 w-5 text-gold transition-transform duration-500 group-hover:rotate-12" />
            {BRAND}
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`nav-link text-[11px] uppercase tracking-[0.2em] transition-colors ${
                  active === item.href ? 'is-active text-gold' : 'text-cream/80 hover:text-cream'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-5">
            <button
              onClick={onOpenSearch}
              aria-label="Search the menu"
              className="-m-2 p-2 text-cream/80 transition-all hover:scale-110 hover:text-gold"
            >
              <Search className="h-4 w-4" />
            </button>

            <button
              onClick={onOpenCart}
              aria-label={`Open your list, ${cartCount} items`}
              className="relative -m-2 p-2 text-cream/80 transition-all hover:scale-110 hover:text-gold"
            >
              <ShoppingBag className="h-4 w-4" />
              <span
                key={cartCount}
                className={`absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold ${
                  cartCount > 0 ? 'animate-pop bg-gold text-forest-dark' : 'bg-cream/20 text-cream'
                }`}
              >
                {cartCount}
              </span>
            </button>

            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="-m-2 p-2 text-cream/80 transition-colors hover:text-gold lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${menuOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!menuOpen}
      >
        <div
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-night/95 backdrop-blur-sm transition-opacity duration-300 ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <div
          className="relative mx-auto w-full max-w-shell px-6 transition-opacity duration-300"
          style={{ opacity: menuOpen ? 1 : 0 }}
        >
          <div className="flex items-center justify-between py-6">
            <span className="flex items-center gap-2 font-serif text-2xl text-cream">
              <LeafGlyph className="h-5 w-5 text-gold" />
              {BRAND}
            </span>
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="text-cream transition-transform hover:rotate-90"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="mt-10 flex flex-col gap-6">
            {NAV.map((item, i) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="font-serif text-3xl text-cream transition-colors hover:text-gold"
                style={{
                  transition: 'opacity 400ms ease, transform 400ms ease, color 200ms ease',
                  transitionDelay: `${menuOpen ? i * 70 + 120 : 0}ms`,
                  opacity: menuOpen ? 1 : 0,
                  transform: menuOpen ? 'none' : 'translateY(16px)',
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <a
            href="#contact"
            onClick={() => setMenuOpen(false)}
            className="btn-gold mt-10"
            style={{
              transition: 'opacity 400ms ease, transform 400ms ease',
              transitionDelay: `${menuOpen ? NAV.length * 70 + 120 : 0}ms`,
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? 'none' : 'translateY(16px)',
            }}
          >
            Visit us
          </a>
        </div>
      </div>
    </>
  )
}
