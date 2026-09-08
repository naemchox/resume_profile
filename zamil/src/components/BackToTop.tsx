import { ArrowUp } from 'lucide-react'
import { useScrolled } from '../hooks/useReveal'

export default function BackToTop() {
  const visible = useScrolled(600)

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-gold text-forest-dark shadow-lg shadow-black/30 transition-all duration-300 hover:bg-gold-dark hover:shadow-xl ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  )
}
