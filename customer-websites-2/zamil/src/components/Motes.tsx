/**
 * Specks of light in the air of a dark room.
 *
 * The positions and timings are a fixed table rather than Math.random(): a
 * random field re-rolls on every render and, more to the point, occasionally
 * deals you four motes in the same corner. These twelve were placed by eye.
 *
 * Each one carries its own duration, wait, drift and peak opacity as custom
 * properties, so no two are ever in step — twelve spans animating in unison
 * read as a machine, and twelve out of step read as air.
 */
const MOTES = [
  { left: '6%', top: '72%', size: 2, dur: 26, wait: 0, dx: 26, peak: 0.55 },
  { left: '14%', top: '88%', size: 3, dur: 34, wait: 6, dx: -18, peak: 0.4 },
  { left: '23%', top: '64%', size: 2, dur: 22, wait: 11, dx: 32, peak: 0.65 },
  { left: '31%', top: '92%', size: 2, dur: 30, wait: 3, dx: 14, peak: 0.35 },
  { left: '42%', top: '78%', size: 3, dur: 38, wait: 15, dx: -26, peak: 0.5 },
  { left: '49%', top: '58%', size: 2, dur: 24, wait: 8, dx: 20, peak: 0.6 },
  { left: '58%', top: '86%', size: 2, dur: 33, wait: 19, dx: -12, peak: 0.45 },
  { left: '66%', top: '68%', size: 3, dur: 28, wait: 2, dx: 30, peak: 0.55 },
  { left: '74%', top: '94%', size: 2, dur: 36, wait: 13, dx: -22, peak: 0.4 },
  { left: '82%', top: '74%', size: 2, dur: 25, wait: 21, dx: 18, peak: 0.7 },
  { left: '89%', top: '84%', size: 3, dur: 31, wait: 5, dx: -16, peak: 0.45 },
  { left: '95%', top: '62%', size: 2, dur: 29, wait: 17, dx: 24, peak: 0.5 },
]

export default function Motes({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="mote"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              '--dur': `${m.dur}s`,
              '--wait': `${m.wait}s`,
              '--dx': `${m.dx}px`,
              '--peak': m.peak,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
