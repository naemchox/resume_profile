import { useEffect, useRef } from 'react'
import { animate, utils } from 'animejs'
import { EASE, onceInView, reducedMotion } from '../motion'

type Props = {
  children: React.ReactNode
  /** Stagger in milliseconds, applied as a delay. */
  delay?: number
  /** Direction the element travels in from. `fade` moves not at all. */
  from?: 'up' | 'left' | 'right' | 'scale' | 'fade'
  /** Overrides the shared duration. Longer suits large, quiet elements. */
  duration?: number
  className?: string
}

/** Where each variant starts. Transform shorthands only — animating top/left or
 *  width would force layout on every frame of thirty simultaneous reveals. */
const FROM: Record<NonNullable<Props['from']>, Record<string, unknown>> = {
  up: { y: [20, 0] },
  left: { x: [-20, 0] },
  right: { x: [20, 0] },
  scale: { scale: [0.97, 1] },
  fade: {},
}

/**
 * Fades a block in as it arrives, on the scroll observer rather than on a class
 * toggle.
 *
 * The version this replaces held `revealed` in React state and let a CSS
 * transition do the work: every reveal on the page was a re-render, and the
 * timing lived in a stylesheet while the trigger lived in a hook. Here the
 * observer is linked straight to the animation as its `autoplay`, so an element
 * arriving costs no render at all, and the two things that were split across two
 * files — when it fires and how it moves — are three lines apart.
 *
 * `repeat: false`, so a block that scrolls back off screen and returns stays put
 * instead of fading in a second time.
 */
export default function Reveal({
  children,
  delay = 0,
  from = 'up',
  duration = 1100,
  className = '',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (reducedMotion()) {
      utils.set(el, { opacity: 1 })
      return
    }

    const animation = animate(el, {
      ...FROM[from],
      opacity: [0, 1],
      duration,
      delay,
      // A plain fade wants its time in the middle; something arriving from an
      // offset wants it at the front. Same reason the CSS version carried two
      // curves.
      ease: from === 'fade' ? 'inOutSine' : EASE.rise,
      // Built paused. Creating it still writes the starting values, which is what
      // holds the block at opacity 0 until it is asked for.
      autoplay: false,
    })

    const stopWatching = onceInView(el, () => animation.play())

    return () => {
      stopWatching()
      animation.revert()
    }
  }, [delay, from, duration])

  /* `.reveal` is opacity: 0 in the stylesheet — the starting state has to exist
     before the effect runs, or every block flashes at full opacity for a frame. */
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  )
}
