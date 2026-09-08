import { useEffect, useRef } from 'react'
import { createTimeline, utils } from 'animejs'
import { onceInView, reducedMotion } from '../motion'

type Props = {
  children: React.ReactNode
  /** Which diagonal the two corners sit on. */
  corners?: 'tl-br' | 'tr-bl'
  /** Milliseconds before the first edge starts. */
  delay?: number
  className?: string
}

/** Each corner is two rules: one horizontal, one vertical, growing from the
 *  corner they share. Positioned outside the photograph's own edge — a frame
 *  sits around a picture, not on it. */
const CORNERS = {
  'tl-br': [
    { axis: 'x', at: '-left-4 -top-4 origin-left' },
    { axis: 'y', at: '-left-4 -top-4 origin-top' },
    { axis: 'x', at: '-bottom-4 -right-4 origin-right' },
    { axis: 'y', at: '-bottom-4 -right-4 origin-bottom' },
  ],
  'tr-bl': [
    { axis: 'x', at: '-right-4 -top-4 origin-right' },
    { axis: 'y', at: '-right-4 -top-4 origin-top' },
    { axis: 'x', at: '-bottom-4 -left-4 origin-left' },
    { axis: 'y', at: '-bottom-4 -left-4 origin-bottom' },
  ],
} as const

/**
 * Two gold corners that draw themselves around a photograph as it arrives.
 *
 * It is the page's one repeated ornament and it should read as a set, so it
 * lives in one component rather than as eight hand-placed spans across two
 * sections — which is what it was, with the running order encoded as eight
 * `transitionDelay` strings that had to be kept in step by hand.
 *
 * A timeline states the order as an order: each edge starts 120ms after the one
 * before, and changing the pace is one number.
 */
export default function PhotoFrame({
  children,
  corners = 'tl-br',
  delay = 0,
  className = '',
}: Props) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return

    const edges = el.querySelectorAll<HTMLSpanElement>('.bracket')
    if (!edges.length) return

    if (reducedMotion()) {
      utils.set(edges, { scaleX: 1, scaleY: 1 })
      return
    }

    const timeline = createTimeline({
      defaults: { duration: 1100, ease: 'outQuint' },
      autoplay: false,
    })

    edges.forEach((edge, i) => {
      // A horizontal rule grows along x, a vertical one along y — each from the
      // corner the pair shares, which is what `origin-*` on the span sets.
      const axis = edge.dataset.axis === 'x' ? 'scaleX' : 'scaleY'
      timeline.add(edge, { [axis]: [0, 1] }, delay + i * 120)
    })

    const stopWatching = onceInView(el, () => timeline.play())

    return () => {
      stopWatching()
      timeline.revert()
    }
  }, [corners, delay])

  return (
    <div ref={root} className={`relative ${className}`}>
      {children}
      {CORNERS[corners].map((edge, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-axis={edge.axis}
          className={`bracket ${edge.axis === 'x' ? 'bracket-h' : 'bracket-v'} ${edge.at}`}
        />
      ))}
    </div>
  )
}
