import { useEffect, useRef } from 'react'
import { animate, onScroll } from 'animejs'
import { reducedMotion } from '../motion'

/**
 * Slow drift for an element as it crosses the viewport, scrubbed to the scroll
 * position.
 *
 * Kept deliberately small — anything past ~30px on a photograph and the image
 * visibly slides inside its own frame, which looks like a bug rather than depth.
 *
 * This was a `requestAnimationFrame` loop behind a scroll listener, measuring
 * `getBoundingClientRect()` every frame and pushing the result through React
 * state — a second clock running beside the animation engine, and a re-render
 * per frame per parallaxed element. `onScroll({ sync: true })` ties the same
 * travel to the same scroll positions with none of that: the observer drives the
 * animation's progress directly, and React never hears about it.
 *
 * `sync: 0.35` rather than `true`: a small amount of lag between the scroll and
 * the drift is what separates parallax from an element that looks nailed to the
 * page at a slight offset.
 */
export function useParallax<T extends HTMLElement>(range = 24, axis: 'y' | 'x' = 'y') {
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Honoured here rather than in CSS: the media-query override can flatten a
    // transition, but it cannot flatten a transform we write from a script.
    if (reducedMotion()) return

    /* The x axis is for the oversized ghost words behind the cream sections:
       they are texture, and texture that slides sideways against the page reads
       as depth where the same word sliding vertically reads as a second
       scrollbar. */
    const property = axis === 'y' ? 'translateY' : 'translateX'

    const observer = onScroll({
      target: node,
      // Defaults: the container's bottom meeting the target's top, through to
      // the container's top meeting the target's bottom — the whole crossing.
      sync: 0.35,
    })

    const animation = animate(node, {
      [property]: [range, -range],
      ease: 'linear',
      autoplay: observer,
    })

    /* An observer resolves its thresholds against the document as it was when it
       was built — and every one of these is built before the photographs below
       it have loaded, so it is measuring a page a few thousand pixels shorter
       than the one the visitor ends up with. Scrolling re-measures and hides the
       problem, which is why it is easy to miss. `load` is when the images are
       finally in and the height is final. */
    const refresh = () => observer.refresh()
    window.addEventListener('load', refresh)

    return () => {
      window.removeEventListener('load', refresh)
      animation.revert()
      observer.revert()
    }
  }, [range, axis])

  return { ref }
}
