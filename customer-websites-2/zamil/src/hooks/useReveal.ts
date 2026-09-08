import { useEffect, useRef, useState } from 'react'
import { onceInView, reducedMotion } from '../motion'

/**
 * True once the element has scrolled into view; never goes back to false.
 *
 * The remaining callers are the ones that need the *fact* of arrival rather than
 * an animation — a counter that should start, a shimmer that should fire once.
 * Anything that only moves uses `Reveal`, which plays an Anime.js animation on
 * the same signal and never re-renders at all.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (reducedMotion()) {
      setRevealed(true)
      return
    }

    return onceInView(node, () => setRevealed(true))
  }, [])

  return { ref, revealed }
}

/** True once the page has scrolled past `offset` pixels. */
export function useScrolled(offset = 40) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])

  return scrolled
}

/** Locks body scroll while any overlay is open. */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}

/** Calls `onEscape` when the Escape key is pressed and `active` is true. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onEscape])
}
