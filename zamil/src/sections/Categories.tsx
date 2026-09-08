import { ChevronRight } from 'lucide-react'
import LeafGlyph from '../components/LeafGlyph'
import Reveal from '../components/Reveal'
import { Shell } from '../components/ui'
import { CATEGORIES, PRODUCTS, type Category } from '../data'

type Props = {
  onSelect: (filter: Category | null) => void
}

/**
 * Typographic tiles, not photographic ones. The shop's library is seven distinct
 * frames; spending four of them here meant every one reappeared a section later,
 * and a photograph of jars says less about "Hybrid" than the count does.
 *
 * What carries them instead is light: each card lifts into a neon rim on hover,
 * so the row reads as four lit signs rather than four grey boxes.
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
                  className="group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-cream/10 bg-night-soft px-6 py-7 shadow-xl shadow-black/40 transition-all duration-500 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_0_40px_-12px_rgba(124,58,237,0.65)]"
                >
                  {/* Violet wash that only exists on hover — the card lights up
                      rather than merely changing border colour. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-br from-neon-violet/20 via-transparent to-neon-green/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />

                  <LeafGlyph className="relative h-5 w-5 text-gold transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110" />

                  <div className="relative mt-8">
                    <h3 className="font-serif text-xl text-cream">{cat.name}</h3>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-cream/45">
                      {count} {cat.filter === 'drink' ? 'items' : 'strains'}
                    </p>
                    <span className="mt-4 flex items-center gap-1 text-[9px] uppercase tracking-[0.25em] text-gold opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                      See the menu <ChevronRight className="h-3 w-3" />
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
