import { useEffect } from 'react'
import { Check } from 'lucide-react'

type Props = {
  message: string | null
  onDismiss: () => void
}

export default function Toast({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(onDismiss, 2600)
    return () => window.clearTimeout(id)
  }, [message, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 transition-all duration-300 ${
        message ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      {message && (
        <div className="flex items-center gap-3 rounded-full bg-cream px-6 py-3 text-xs text-forest-dark shadow-lg shadow-black/30">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold">
            <Check className="h-3 w-3 text-forest-dark" />
          </span>
          {message}
        </div>
      )}
    </div>
  )
}
