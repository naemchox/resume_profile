import { ChevronRight } from 'lucide-react'
import LeafGlyph from '../components/LeafGlyph'
import Reveal from '../components/Reveal'
import { Shell } from '../components/ui'
import { spotlight } from '../hooks/useSpotlight'
import { CATEGORIES, PRODUCTS, type Category } from '../data'

type Props = {
  onSelect: (filter: Category | null) => void
}

/**
 * Typographic tiles, not photographic ones. The shop's library is seven distinct
 * frames; spending four of them here meant every one reappeared a section later,
 * and a photograph of jars says less about "Hybrid" than the count does.
 *
 * The trouble with the first version of that argument was that it left the tile
 * genuinely empty — a 20px glyph, a name and a count, floating in a dark box
 * seven times the size of its own contents. Typographic is not the same as
 * blank. So the count is now set as the tile's own numeral, at the size the box
 * was always asking for, and the leaf runs off the corner as a watermark behind
 * it. What was dead space is now the graphic.
 */
export default function Categories({ onSelect }: Props) {
  return (
    /* Pulled up so the tiles straddle the hero boundary rather than starting a
       fresh, evenly-spaced band. */
    <section className="relative z-20 -mt-16 bg-gradient-to-b from-night to-night-soft pb-20 lg:-mt-20">
      <Shell>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {CATEGORIES.map((cat, i) => {
            const count = PRODUCTS.filter((p) => p.category === cat.filter).length
            return (
              <Reveal key={cat.name} from="scale" delay={i * 70}>
                <a
                  href="#products"
                  onClick={() => onSelect(cat.filter)}
                  onPointerMove={spotlight}
                  className="group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-cream/10 bg-night-soft px-6 py-7 shadow-xl shadow-black/40 transition-all duration-500 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_0_40px_-12px_rgba(124,58,237,0.65)]"
                >
                  {/* The leaf, run off the bottom-right corner at ten times the
                      size it was. Cropped by the tile, so it reads as a mark
                      stamped on the card rather than an icon sitting on it. */}
                  <LeafGlyph
                    className="pointer-events-none absolute -bottom-8 -right-6 h-28 w-28 text-cream/[0.045] transition-all duration-700 group-hover:-rotate-12 group-hover:scale-110 group-hover:text-gold/20"
                  />

                  {/* Violet wash that only exists on hover — the card lights up
                      rather than merely changing border colour. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-br from-neon-violet/20 via-transparent to-neon-green/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />

                  {/* Gold pooled under the cursor. Desktop only in practice: with
                      no pointer it stays centred at zero opacity. */}
                  <span aria-hidden="true" className="spot absolute inset-0" />

                  {/* Hairline that runs the width of the card on hover, the same
                      gesture as the nav underline and the product rows. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-gold via-gold/40 to-transparent transition-transform duration-700 group-hover:scale-x-100"
                  />

                  <div className="relative flex items-start justify-between">
                    <LeafGlyph className="h-5 w-5 text-gold transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110" />
                    {/* The count, as the tile's numeral. It was already the only
                        information here that varies between the four cards. */}
                    <span className="font-serif text-4xl leading-none text-cream/15 transition-colors duration-500 group-hover:text-gold/60">
                      {String(count).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="relative mt-8">
                    <h3 className="font-serif text-xl text-cream">{cat.name}</h3>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-cream/45">
                      {cat.filter === 'drink' ? 'items' : 'strains'}
                    </p>
                    <span className="mt-4 flex translate-y-1 items-center gap-1 text-[9px] uppercase tracking-[0.25em] text-gold opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                      See the menu
                      <ChevronRight className="h-3 w-3 transition-transform duration-500 group-hover:translate-x-1" />
                    </span>
                  </div>
                </a>
              </Reveal>
            )
          })}
        </div>
      </Shell>
    </section>
  )
}
