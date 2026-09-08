import { BLADE, BLADES } from './LeafGlyph'

/**
 * The shop's mark as the shop actually wears it: a leaf bent out of neon tube,
 * over the door, on all night.
 *
 * The difference from LeafGlyph is one property. LeafGlyph fills its blades,
 * which is right at 12px in a line of type; a filled shape at 30rem is a
 * silhouette, and a silhouette is not a sign. Stroked, the same seven blades
 * become tube — and tube is what the glow belongs to.
 *
 * Neon does not fade up. It stutters two or three times on the transformer and
 * then holds, which is `neon-strike`; `neon-breathe`, on the wrapper, is the
 * slow rise and fall of the bloom once it has settled. Two elements, because
 * one element cannot run two animations over the same property.
 */
export default function NeonLeafMark({
  className = '',
  /** Off where a timeline drives the strike instead — the hero sequences it
   *  against the rest of its arrival, and two things animating one opacity is
   *  how you get a sign that flickers twice for no reason. */
  strike = true,
}: {
  className?: string
  strike?: boolean
}) {
  return (
    <span aria-hidden="true" className={`neon-glow block ${className}`}>
      <svg
        viewBox="-56 -56 112 68"
        className={`h-full w-full ${strike ? 'neon-strike' : ''}`}
        fill="none"
      >
        {BLADES.map((b) => (
          <path
            key={b.angle}
            d={BLADE}
            transform={`rotate(${b.angle}) scale(${b.scale})`}
            stroke="currentColor"
            strokeWidth={1.1 / b.scale}
            strokeLinejoin="round"
            opacity={0.35 + 0.45 * b.scale}
          />
        ))}
        <path d="M0 0 L0 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </span>
  )
}
