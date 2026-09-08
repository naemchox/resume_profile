/**
 * The shop's mark is a gold cannabis leaf, so the page gets one too — drawn
 * rather than imported, which keeps it a single colour we can inherit and scale.
 *
 * Seven blades, mirrored: one lens-shaped path rotated and foreshortened, since
 * the outer blades on a real leaf are both shorter and turned further back.
 */
const BLADES = [
  { angle: 0, scale: 1 },
  { angle: 26, scale: 0.88 },
  { angle: -26, scale: 0.88 },
  { angle: 52, scale: 0.7 },
  { angle: -52, scale: 0.7 },
  { angle: 78, scale: 0.5 },
  { angle: -78, scale: 0.5 },
]

const BLADE = 'M0 0 C 7 -14 7 -32 0 -48 C -7 -32 -7 -14 0 0 Z'

export default function LeafGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="-52 -52 104 60"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      {BLADES.map((b) => (
        <path
          key={b.angle}
          d={BLADE}
          transform={`rotate(${b.angle}) scale(${b.scale})`}
          opacity={0.55 + 0.45 * b.scale}
        />
      ))}
      {/* Stem, so the glyph doesn't float. */}
      <rect x="-1" y="0" width="2" height="7" rx="1" />
    </svg>
  )
}
