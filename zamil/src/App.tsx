import { useCallback, useState } from 'react'
import AgeGate from './components/AgeGate'
import BackToTop from './components/BackToTop'
import CartDrawer from './components/CartDrawer'
import Header from './components/Header'
import SearchOverlay from './components/SearchOverlay'
import Toast from './components/Toast'
import { useCart } from './hooks/useCart'
import { PRODUCTS, type Category } from './data'

import Hero from './sections/Hero'
import Categories from './sections/Categories'
import About from './sections/About'
import Products from './sections/Products'
import Room from './sections/Room'
import ScrollProgress from './components/ScrollProgress'
import Benefits from './sections/Benefits'
import Consultation from './sections/Consultation'
import Contact from './sections/Contact'
import Footer from './sections/Footer'

export default function App() {
  const cart = useCart()
  const [cartOpen, setCartOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filter, setFilter] = useState<Category | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const addToCart = useCallback(
    (id: string) => {
      const product = PRODUCTS.find((p) => p.id === id)
      cart.add(id)
      setToast(product ? `${product.name} added to your list` : 'Added to your list')
    },
    [cart],
  )

  /* The shop sells over the counter only. The list is a note to bring with you,
     not an order — so this says where to bring it instead of pretending to sell. */
  const checkout = () => {
    setCartOpen(false)
    setToast('Walk-in only — show your list at the counter, Soi Pridi Banomyong 40')
  }

  const dismissToast = useCallback(() => setToast(null), [])

  return (
    <>
      <AgeGate />
      <ScrollProgress />

      {/* Film grain over everything. Fixed and inert — it exists to take the
          flatness off large areas of one colour. */}
      <div
        aria-hidden="true"
        className="grain pointer-events-none fixed inset-0 z-[65] opacity-[0.055] mix-blend-overlay"
      />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-gold focus:px-5 focus:py-2 focus:text-xs focus:text-forest-dark"
      >
        Skip to content
      </a>

      <Header
        cartCount={cart.count}
        onOpenCart={() => setCartOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <main id="main" className="bg-night">
        <Hero />
        <Categories onSelect={setFilter} />
        <About />
        <Products filter={filter} onFilter={setFilter} onAdd={addToCart} />
        <Room />
        <Benefits />
        <Consultation />
        <Contact />
      </main>

      <Footer />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onCheckout={checkout}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onAdd={addToCart} />
      <Toast message={toast} onDismiss={dismissToast} />
      <BackToTop />
    </>
  )
}
