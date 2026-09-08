import { useEffect, useRef } from 'react'
import { createTimeline, stagger, svg } from 'animejs'
import { EASE, onceInView, reducedMotion } from '../motion'

/** A leaf lying along +x from its own tip: 26 long, 10 across at the widest. */
const LEAF = 'M0 0 C 6 -5, 20 -5, 26 0 C 20 5, 6 5, 0 0 Z'

/** One blade of the centre sprig, standing up from the line. */
const BLADE = 'M0 0 C 3 -5, 3 -11, 0 -16 C -3 -11, -3 -5, 0 0 Z'

/**
 * The rule under a section title, drawn instead of printed.
 *
 * What was there was `.rule-fade` — a 1px gradient, 160px wide, identical under
 * every heading. This is the page's one repeated ornament, so it is worth more
 * than a straight line: a stem that grows outward from the centre, throws two
 * leaves, and finishes on the shop's own mark.
 *
 * `svg.createDrawable` is the whole reason this is short. The previous version
 * measured every path with `getTotalLength()`, wrote the number into a custom
 * property, and let a CSS transition run `stroke-dashoffset` home — which is the
 * dash trick spelled out by hand, with the ordering of the four parts encoded as
 * four magic `transitionDelay` values. A drawable exposes the same thing as a
 * plain `draw: '0 1'` tween, and a timeline states the order in the order.
 */
export default function VineRule({
  className = '',
  tone = 'gold',
}: {
  className?: string
  /** `gold` on the dark bands, `ink` on the cream ones. */
  tone?: 'gold' | 'ink'
}) {
  const root = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return

    const pick = (selector: string) =>
      svg.createDrawable(Array.from(el.querySelectorAll<SVGPathElement>(selector)))

    // Reduced motion: leave every path at its natural full length. Creating the
    // drawables at all would set a dash offset we then have to undo.
    if (reducedMotion()) return

    const stems = pick('.vine-stem')
    const leaves = pick('.vine-leaf')
    const blades = pick('.vine-blade')

    const timeline = createTimeline({
      defaults: { duration: 900, ease: EASE.draw },
      autoplay: false,
    })
      // Both stems run outward at once rather than one chasing the other across.
      .add(stems, { draw: ['0 0', '0 1'] }, 0)
      .add(leaves, { draw: ['0 0', '0 1'], duration: 620 }, 480)
      // The mark last, blade by blade, so it opens rather than appears.
      .add(blades, { draw: ['0 0', '0 1'], duration: 520, delay: stagger(90) }, 820)

    const stopWatching = onceInView(el, () => timeline.play())

    return () => {
      stopWatching()
      timeline.revert()
    }
  }, [])

  const stroke = tone === 'gold' ? 'rgba(239,199,94,0.75)' : 'rgba(221,178,70,0.85)'

  return (
    <div aria-hidden="true" className={className}>
      <svg
        ref={root}
        viewBox="0 0 240 28"
        className="mx-auto block h-7 w-60 overflow-visible"
        fill="none"
        stroke={stroke}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path className="vine-stem" d="M120 20 H 10" />
        <path className="vine-stem" d="M120 20 H 230" />

        {/* A leaf on each stem: long and pointed at both ends. The first version
            of this was 26 wide and 16 tall, which is a circle with ambitions.
            Anchored at the tip and rotated, so both are the same path and the
            pair actually mirrors. */}
        <path className="vine-leaf" d={LEAF} transform="translate(92 20) rotate(200)" />
        <path className="vine-leaf" d={LEAF} transform="translate(148 20) rotate(-20)" />

        {/* The mark itself: three blades standing off the line at the centre —
            the logo's seven-blade geometry cut down to the three that survive at
            this size. */}
        <g transform="translate(120 20)">
          {[0, -32, 32].map((angle) => (
            <path
              key={angle}
              className="vine-blade"
              d={BLADE}
              transform={`rotate(${angle}) scale(${angle === 0 ? 1 : 0.68})`}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
