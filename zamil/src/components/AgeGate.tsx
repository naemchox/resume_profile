import { useState } from 'react'
import LeafGlyph from './LeafGlyph'
import { useScrollLock } from '../hooks/useReveal'
import { BRAND } from '../data'

const STORAGE_KEY = 'mayagreen_age_ok_v1'

function initialStatus(): 'asking' | 'passed' {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'yes' ? 'passed' : 'asking'
  } catch {
    return 'asking'
  }
}

/**
 * Thailand's legal age for cannabis is 20, and the shop checks ID at the counter.
 * This gate is the client-side courtesy that mirrors that rule — it stops nobody
 * who does not want to be stopped, which is why the real check happens in store.
 *
 * The stored answer is read during the first render, not in an effect: reading
 * it later lets the page flash on screen before the gate appears.
 */
export default function AgeGate() {
  const [status, setStatus] = useState<'asking' | 'passed' | 'denied'>(initialStatus)

  useScrollLock(status !== 'passed')

  if (status === 'passed') return null

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'yes')
    } catch {
      // Non-persistent storage — the gate will simply ask again next visit.
    }
    setStatus('passed')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="haze fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-night px-6"
    >
      <div className="animate-scale-in relative w-full max-w-md text-center">
        <LeafGlyph className="mx-auto h-9 w-9 text-gold drop-shadow-[0_0_18px_rgba(239,199,94,0.5)]" />
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
