import Photo from '../components/Photo'
import Reveal from '../components/Reveal'
import { Shell } from '../components/ui'
import { useParallax } from '../hooks/useParallax'

/**
 * Three tiles, three frames, each used nowhere else on the page. The wide fascia
 * plate that used to sit above them was a 2:1 crop of the same photograph the
 * visit block shows in full, so it went rather than repeat the frontage twice.
 *
 * These are the darkest photographs in the library — a lounge lit violet and a
 * terrace lit by a neon sign — so this band goes to near-black and lets them
 * glow instead of fighting a green backdrop.
 */
const TILES = [
  {
    name: 'lounge',
    alt: 'The lounge: pendant lamps, bean bags and violet cove lighting',
    label: 'The lounge',
    range: 14,
  },
  {
    name: 'counter',
    alt: 'Staff rolling at the counter, the gold wordmark behind',
    label: 'The counter',
    range: 26,
  },
  {
    name: 'terrace',
    alt: 'Terrace seating and the neon cannabis-leaf Open sign',
    label: 'The terrace',
    range: 18,
  },
]

function Tile({ tile, delay }: { tile: (typeof TILES)[number]; delay: number }) {
  /* A different drift per tile, so the row breathes rather than sliding as one
     rigid block. */
  const drift = useParallax<HTMLDivElement>(tile.range)

  return (
    <Reveal delay={delay}>
      <figure className="group">
        <div ref={drift.ref} style={drift.style}>
          <Photo
            name={tile.name}
            alt={tile.alt}
            className="img-zoom aspect-[4/5] rounded-xl shadow-2xl shadow-black/50 transition-shadow duration-700 group-hover:shadow-[0_0_50px_-12px_rgba(124,58,237,0.7)]"
          />
        </div>
        <figcaption className="mt-3 text-[10px] uppercase tracking-[0.25em] text-cream/45 transition-colors duration-500 group-hover:text-gold">
          {tile.label}
        </figcaption>
      </figure>
    </Reveal>
  )
}

export default function Room() {
  return (
    <section className="haze relative overflow-hidden bg-night py-20 lg:py-24">
      <Shell className="relative">
        <Reveal className="text-center">
          <p className="eyebrow">The room</p>
          <h2 className="mt-3 font-serif text-3xl leading-snug text-cream sm:text-4xl">
            A living wall
            <br />
            and <span className="text-neon-green">neon</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {TILES.map((tile, i) => (
            <Tile key={tile.name} tile={tile} delay={i * 70} />
          ))}
        </div>
      </Shell>
    </section>
  )
}
