import LeafGlyph from '../components/LeafGlyph'
import Reveal from '../components/Reveal'
import { Shell } from '../components/ui'

/**
 * The shop's own three standards. No therapeutic claim appears here on purpose:
 * Thailand's medical-only framing allows a shop to describe its sourcing, not to
 * advertise what cannabis treats. See the legal note in FACTS.md.
 *
 * Cream, like the menu — the two sections that carry the shop's actual argument
 * are the two that come out of the dark.
 */
const STANDARDS = [
  {
    title: 'Provenance',
    body: 'We know where our flower comes from. A GACP-certified Thai farm means cultivation and harvest you can trace back.',
  },
  {
    title: 'Medical grade',
    body: "International medical grade only. That's our floor, not our headline.",
  },
  {
    title: 'Keeping',
    body: 'Chosen one harvest at a time, stored properly, and handed over with a straight answer.',
  },
]

export default function Benefits() {
  return (
    <section className="relative overflow-hidden bg-cream py-20 lg:py-28">
      <span
        aria-hidden="true"
        className="ghost-type ghost-type--ink pointer-events-none absolute hidden -top-16 left-1/2 sm:block -translate-x-1/2 whitespace-nowrap font-serif leading-none text-[clamp(3.5rem,13vw,10rem)]"
      >
        STANDARDS
      </span>

      <Shell className="relative">
        <Reveal className="text-center">
          <p className="text-[10px] uppercase tracking-[0.35em] text-gold-dark">Standards</p>
          <h2 className="mt-3 font-serif text-3xl leading-snug text-ink sm:text-4xl">
            Three things we
            <br />
            never compromise
          </h2>
          <span className="rule-fade mx-auto mt-6 block h-px w-40" />
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-ink/10 md:grid-cols-3">
          {STANDARDS.map((item, i) => (
            <Reveal key={item.title} delay={i * 90} className="bg-cream">
              {/* Numbered rather than iconed: three generic glyphs said less than
                  01 / 02 / 03 does, and the leaf is the mark that means anything
                  on this page. */}
              <div className="group h-full px-8 py-10 transition-colors duration-500 hover:bg-[#EFE9DA]">
                <div className="flex items-baseline justify-between">
                  <span className="font-serif text-4xl text-gold-dark/70">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <LeafGlyph className="h-4 w-4 text-ink/15 transition-all duration-500 group-hover:rotate-12 group-hover:text-gold-dark" />
                </div>
                <h3 className="mt-6 font-serif text-xl text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Shell>
    </section>
  )
}
