import { useState } from 'react'

/**
 * Posts form data to the endpoint in VITE_CONTACT_ENDPOINT (Formspree, Basin,
 * your own API — anything that accepts a JSON POST).
 *
 * If no endpoint is configured we surface that as an error rather than faking
 * a success message: a visitor who sees "thanks, we'll be in touch" when
 * nothing was sent is worse than no form at all.
 */
export type FormState = 'idle' | 'sending' | 'sent' | 'error' | 'unconfigured'

export function useFormSubmit() {
  const [state, setState] = useState<FormState>('idle')

  const submit = async (payload: Record<string, string>) => {
    const endpoint = import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined

    if (!endpoint) {
      setState('unconfigured')
      return
    }

    setState('sending')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      setState(res.ok ? 'sent' : 'error')
    } catch {
      setState('error')
    }
  }

  return { state, submit, reset: () => setState('idle') }
}
