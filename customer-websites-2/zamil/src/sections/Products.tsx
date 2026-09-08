import { Plus } from 'lucide-react'
import LeafGlyph from '../components/LeafGlyph'
import Photo from '../components/Photo'
import Reveal from '../components/Reveal'
import { Shell, SectionTitle } from '../components/ui'
import { useCountUp } from '../hooks/useCountUp'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import {
  DRINK_GROUPS,
  FLOWER_GROUPS,
  FLOWER_PRICE,
  PRODUCTS,
  TABS,
  baht,
  priceLabel,
  type Category,
  type Product,
} from '../data'

type Props = {
  filter: Category | null
  onFilter: (filter: Category | null) => void
  onAdd: (id: string) => void
}

/** Strongest strain on the board, so the meters are scaled against something real. */
const THC_CEILING = Math.max(...PRODUCTS.map((p) => p.thc ?? 0))

const RING = 2 * Math.PI * 15

/** THC as an arc rather than a number in a pill: eight of these in a column let
 *  you compare strengths at a glance, which eight percentages don't.
 *
 *  The arc now sweeps to its value and the figure counts up under it. Eight
 *  meters drawing themselves in sequence down the board is the one moment where
 *  the page's motion is carrying information rather than decorating it — you
 *  watch Dante Inferno go further round than Super Lemon Haze. */
function ThcMeter({ value }: { value: number }) {
  const { ref, revealed } = useReveal<HTMLSpanElement>()
  const shown = useCountUp(value, revealed, 1100)
  const filled = (shown / THC_CEILING) * RING

  return (
    <span
      ref={ref}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(18,37,27,0.12)" strokeWidth="2" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="#DDB246"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${RING}`}
        />
      </svg>
      <span className="text-[10px] font-medium text-ink">{shown}%</span>
      {/* The real figure, always, whatever the animation is showing. */}
      <span className="sr-only">THC {value} per cent</span>
    </span>
  )
}

/** One line of the board: what it is, what it costs, and a way to note it down. */
function Row({ p, onAdd }: { p: Product; onAdd: (id: string) => void }) {
  return (
    <li className="group relative flex items-start gap-4 border-b border-ink/10 py-4 last:border-0">
      {/* Gold edge that grows on hover — the same gesture as the nav underline. */}
      <span
        aria-hidden="true"
        className="absolute -left-4 top-0 h-full w-px origin-top scale-y-0 bg-gold transition-transform duration-500 group-hover:scale-y-100"
      />

      {p.thc !== undefined && <ThcMeter value={p.thc} />}

      <div className="flex-1">
        <h4 className="font-serif text-base text-ink transition-transform duration-500 group-hover:translate-x-1">
          {p.name}
        </h4>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-soft">{p.blurb}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-ink">{priceLabel(p)}</p>
        <button
          onClick={() => onAdd(p.id)}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-ink/20 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-ink-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-gold hover:bg-gold/15 hover:text-ink"
        >
          <Plus className="h-3 w-3" /> List
        </button>
      </div>
    </li>
  )
}

export default function Products({ filter, onFilter, onAdd }: Props) {
  const board = useParallax<HTMLDivElement>(20)
  const ghost = useParallax<HTMLSpanElement>(60, 'x')
  // The slab's own observer, so the highlight fires when the PRICE arrives rather
  // than when the column it sits in does.
  const slab = useReveal<HTMLDivElement>()
  const price = useCountUp(FLOWER_PRICE, slab.revealed, 1500)
  const showFlower = filter === null || filter !== 'drink'
  const showDrinks = filter === null || filter === 'drink'

  const flowerGroups = FLOWER_GROUPS.filter((g) => filter === null || filter === g.label).map(
    (g) => ({ ...g, items: PRODUCTS.filter((p) => p.category === g.label) }),
  )

  return (
    /* The one cream band in the page. The menu is what a visitor came for, and
       lifting it out of the dark is what makes it read as the main event rather
       than the fourth green section in a row. */
    <section id="products" className="relative scroll-mt-24 overflow-hidden bg-cream py-20 lg:py-24">
      {/* Two elements, because the centering and the drift are both transforms
          and an inline style would simply replace the utility class. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-1/2 hidden -translate-x-1/2 sm:block"
      >
        <span
          ref={ghost.ref}
          className="ghost-type ghost-type--ink block whitespace-nowrap font-serif leading-none text-[clamp(3.5rem,13vw,10rem)]"
        >
          SAMURAI
        </span>
      </span>

      <Shell className="relative">
        <SectionTitle
          eyebrow="Currently in"
          title="The Samurai Weed board"
          accent="Samurai"
          tone="ink"
        />

        <Reveal delay={100}>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {TABS.map((tab) => (
              <button
                key={tab.label}
                onClick={() => onFilter(tab.value)}
                aria-pressed={filter === tab.value}
                className={`rounded-full px-6 py-2 text-[10px] uppercase tracking-[0.2em] transition-all duration-300 ${
                  filter === tab.value
                    ? 'scale-105 bg-ink text-cream shadow-lg shadow-ink/20'
                    : 'border border-ink/20 text-ink-soft hover:border-ink/60 hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </Reveal>

        {showFlower && (
          <div className="mt-14 grid gap-12 lg:grid-cols-[0.85fr_1fr] lg:gap-14">
            <Reveal from="left">
              <div ref={board.ref}>
                <Photo
                  name="shelf_samurai"
                  alt="The Samurai Weed board and the flower jars"
                  className="aspect-[4/5] rounded-2xl shadow-2xl shadow-ink/25 ring-1 ring-gold/40"
                />
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
                The Samurai Weed board as it stands on the shelf — the list beside it is transcribed
                from that board, strain for strain.
              </p>
            </Reveal>

            <Reveal from="right" delay={100}>
              {/* The flat price is the single most unusual thing about this shop,
                  so it gets the dark slab and the one moving highlight on the
                  page rather than a grey line of small caps. */}
              <div
                ref={slab.ref}
                className="relative overflow-hidden rounded-2xl bg-night px-6 py-6 text-center shadow-xl shadow-ink/25 ring-1 ring-gold/25"
              >
                {slab.revealed && (
                  <span aria-hidden="true" className="shimmer-once absolute inset-0" />
                )}
                <p className="relative text-[10px] uppercase tracking-[0.3em] text-cream/50">
                  One price, every strain
                </p>
                {/* Counts up to the figure rather than sitting on it. It is the
                    one number a visitor came to find, and the flat price is the
                    single most unusual thing about this shop. */}
                <p className="relative mt-2 font-serif text-4xl text-gold" aria-hidden="true">
                  {baht(price)}
                </p>
                <span className="sr-only">{baht(FLOWER_PRICE)} per gram</span>
                <p className="relative text-[10px] uppercase tracking-[0.25em] text-cream/45">
                  per gram
                </p>
              </div>

              {flowerGroups.map((group) => (
                <div key={group.title} className="mt-8">
                  <div className="flex items-baseline justify-between border-b border-gold-dark/40 pb-2">
                    <h3 className="flex items-center gap-2 font-serif text-lg text-ink">
                      <LeafGlyph className="h-3 w-3 text-gold-dark" />
                      {group.title}
                    </h3>
                    <span className="text-[10px] uppercase tracking-widest text-ink-soft">
                      {group.items.length} {group.items.length === 1 ? 'strain' : 'strains'}
                    </span>
                  </div>
                  <ul>
                    {group.items.map((p) => (
                      <Row key={p.id} p={p} onAdd={onAdd} />
                    ))}
                  </ul>
                </div>
              ))}
            </Reveal>
          </div>
        )}

        {showDrinks && (
          <Reveal delay={80} className={showFlower ? 'mt-20' : 'mt-14'}>
            <div className="border-b border-gold-dark/40 pb-2">
              <p className="text-[10px] uppercase tracking-[0.35em] text-gold-dark">At the bar</p>
              <h3 className="mt-2 font-serif text-2xl text-ink">Drinks</h3>
            </div>

            <div className="mt-6 grid gap-x-14 gap-y-8 lg:grid-cols-2">
              {DRINK_GROUPS.map((group) => {
                const items = PRODUCTS.filter((p) => p.group === group)
                if (!items.length) return null
                return (
                  <div key={group}>
                    <h4 className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">
                      {group}
                    </h4>
                    <ul className="mt-2">
                      {items.map((p) => (
                        <Row key={p.id} p={p} onAdd={onAdd} />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </Reveal>
        )}

        <Reveal delay={60}>
          <p className="mx-auto mt-14 max-w-lg text-center text-[11px] leading-relaxed text-ink-soft">
            The list changes with each harvest — please check the current round before you travel.
            Serving sizes on the drink board follow its own group headings; ask us in store if you
            need the exact pour.
          </p>
        </Reveal>
      </Shell>
    </section>
  )
}
