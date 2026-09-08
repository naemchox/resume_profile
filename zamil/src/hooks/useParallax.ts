import { useEffect, useRef, useState } from 'react'

/**
 * Slow vertical drift for a photo as it crosses the viewport. Kept deliberately
 * small — anything past ~30px and the image visibly slides inside its own frame,
 * which looks like a bug rather than depth.
 *
 * Honours prefers-reduced-motion by never moving at all: the CSS override at the
 * top of index.css can flatten a transition, but it cannot flatten a transform
 * we write from JS, so the check has to live here.
 */
export function useParallax<T extends HTMLElement>(range = 24) {
  const ref = useRef<T>(null)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0

    const update = () => {
      frame = 0
      const node = ref.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      // -1 when the element sits a screen below the fold, +1 a screen above it.
      const progress = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight
      setOffset(Math.max(-1, Math.min(1, progress)) * range)
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [range])

  return { ref, style: { transform: `translate3d(0, ${offset.toFixed(1)}px, 0)` } }
}
