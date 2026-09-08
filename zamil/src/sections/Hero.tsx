import { Check, Clock } from 'lucide-react'
import LeafGlyph from '../components/LeafGlyph'
import Photo from '../components/Photo'
import Reveal from '../components/Reveal'
import { Shell } from '../components/ui'
import { useParallax } from '../hooks/useParallax'
import { BRAND, FLOWER_PRICE, HOURS_CLOSED, HOURS_SHORT, baht } from '../data'

/** Each of these is a confirmed fact, not a slogan — see FACTS.md. */
const POINTS = [
  'GACP-certified Thai farm',
  'International medical grade only',
  `One price, every strain — ${baht(FLOWER_PRICE)} per gram`,
]

export default function Hero() {
  const plate = useParallax<HTMLDivElement>(18)

  return (
    /* Near-black rather than forest green: the real shopfront is gold on black,
       and the two drifting pools of light are the lounge's violet and green cove
       lighting. Both belong to the shop — neither was in the palette before. */
    <section
      id="top"
      className="haze relative overflow-hidden bg-night pb-32 pt-32 sm:pt-36 lg:pb-44 lg:pt-44"
    >
      <Shell className="relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <div className="relative z-10">
          <Reveal>
            <p className="eyebrow flex items-center gap-2">
              <LeafGlyph className="h-3 w-3 text-gold" />
              Ekkamai · Bangkok
            </p>
            <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.05] text-cream sm:text-[3.2rem] lg:text-[3.8rem]">
              <span className="underline-grow neon-text">{BRAND}</span>
              <br />
              Selected Cannabis Boutique
            </h1>
          </Reveal>

          {/* One reveal for the whole supporting block. Animating the intro,
              each bullet and the buttons separately made the hero take well
              over a second to settle. */}
          <Reveal delay={120}>
            <p className="mt-7 max-w-md text-sm leading-relaxed text-cream/70">
              Medical-grade flower to an international standard, from a GACP-certified Thai farm —
              chosen one harvest at a time, and kept the way it deserves to be kept.
            </p>

            <ul className="mt-7 space-y-3.5">
              {POINTS.map((point) => (
                <li key={point} className="flex items-center gap-3 text-sm text-cream/85">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold">
                    <Check className="h-3.5 w-3.5 text-forest-dark" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a href="#products" className="btn-gold">
                See the selection
              </a>
              <a href="#contact" className="btn-outline">
                Come to the shop
              </a>
            </div>
          </Reveal>
        </div>

        {/* Bleeds past the container on large screens so the page doesn't read as
            two equal boxes side by side. Capped at 4rem: tying it to
            (100vw - shell)/2 alone makes it grow without limit on ultrawide
            screens and at low browser zoom. */}
        <Reveal
          from="scale"
          delay={200}
          className="relative lg:-mr-[min(4rem,max(0px,calc((100vw-1180px)/2+1.5rem)))]"
        >
          <div ref={plate.ref} style={plate.style}>
            <Photo
              name="storefront_night"
              alt="The MAYA GREEN frontage at night, sign lit"
              position="55% center"
              priority
              className="neon-edge aspect-[4/3] rounded-2xl sm:aspect-[16/10] lg:aspect-auto lg:h-[32rem] lg:rounded-l-2xl lg:rounded-r-none"
            />
          </div>

          {/* Floating card, overlapping the image edge for depth. The opening
              hours are the one thing a walk-in shop's visitor needs first — and
              the Tuesday closure is real, so it is stated rather than buried. */}
          <div className="absolute -bottom-6 left-4 flex items-center gap-3 rounded-2xl bg-cream px-5 py-4 shadow-xl shadow-black/25 sm:left-8 lg:-left-8">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night">
              <Clock className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink-soft/70">Opening hours</p>
              <p className="mt-1 text-xs font-medium text-ink">{HOURS_SHORT}</p>
              <p className="text-[10px] text-ink-soft">{HOURS_CLOSED}</p>
            </div>
          </div>
        </Reveal>
      </Shell>

    </section>
  )
}
