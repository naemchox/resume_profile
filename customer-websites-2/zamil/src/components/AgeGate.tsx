import { useState } from 'react'
import Aurora from './Aurora'
import Motes from './Motes'
import NeonLeafMark from './NeonLeafMark'
import { useScrollLock } from '../hooks/useReveal'
import { BRAND } from '../data'

/**
 * Thailand's legal age for cannabis is 20, and the shop checks ID at the counter.
 * This gate is the client-side courtesy that mirrors that rule — it stops nobody
 * who does not want to be stopped, which is why the real check happens in store.
 *
 * The answer is deliberately NOT remembered. Every page load asks again, so a
 * shared or public browser never carries one person's confirmation over to the
 * next visitor. Restoring persistence means restoring that hole — don't.
 *
 * `onEnter` fires once, when the visitor passes. The page mounts on that signal
 * rather than behind the gate, so every arrival animation starts when the gate
 * clears instead of playing to an empty room — see the note in App.
 */
export default function AgeGate({ onEnter }: { onEnter: () => void }) {
  const [status, setStatus] = useState<'asking' | 'passed' | 'denied'>('asking')

  useScrollLock(status !== 'passed')

  if (status === 'passed') return null

  const accept = () => {
    setStatus('passed')
    onEnter()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-night px-6"
    >
      <Aurora />
      <Motes />

      <div className="animate-scale-in relative z-10 w-full max-w-md text-center">
        {/* The gate is the first thing anyone sees, so the mark strikes here the
            way it does over the door — the page's whole argument is that this is
            a boutique, and it should be making it before the first heading. */}
        <NeonLeafMark className="mx-auto h-16 w-16 text-gold" />
        <p className="mt-4 text-[10px] uppercase tracking-[0.35em] text-cream/40">{BRAND}</p>
        <h1 id="age-gate-title" className="mt-4 font-serif text-3xl text-cream">
          {status === 'asking' ? 'Are you 20 or older?' : 'Come back another time'}
        </h1>

        {status === 'asking' ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-cream/65">
              You must be 20 or over to enter. Bring ID or a passport when you visit — we check at
              the counter, and we don&rsquo;t sell to anyone under 20, or to pregnant or
              breastfeeding women.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button onClick={accept} className="btn-gold" autoFocus>
                Yes, I am 20+
              </button>
              <button onClick={() => setStatus('denied')} className="btn-outline">
                No
              </button>
            </div>
            <p className="mt-6 text-[11px] leading-relaxed text-cream/70">
              Cannabis is supplied for medical purposes under Thai law. This site does not give
              medical advice.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-cream/65">
              You must be 20 or older to enter this site.
            </p>
            <button onClick={() => setStatus('asking')} className="btn-outline mt-8">
              I answered by mistake
            </button>
          </>
        )}
      </div>
    </div>
  )
}
