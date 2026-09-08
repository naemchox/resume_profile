/**
 * The lounge's cove lighting, as a backdrop layer.
 *
 * The shop's own room is lit violet and green over a black wall, and the gold
 * sign throws a third, warmer pool. Three drifting circles at three different
 * periods — 42s, 55s and 71s — never repeat the same arrangement, so a page you
 * sit on for a minute is not the page you arrived at.
 *
 * Absolutely positioned and inert: drop it inside any `relative overflow-hidden`
 * section and put the content above it with a z-index.
 */
export default function Aurora({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`aurora ${className}`}>
      <span className="pool-violet" />
      <span className="pool-green" />
      <span className="pool-gold" />
    </div>
  )
}
