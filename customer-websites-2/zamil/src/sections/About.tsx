import Photo from '../components/Photo'
import PhotoFrame from '../components/PhotoFrame'
import Reveal from '../components/Reveal'
import WordReveal from '../components/WordReveal'
import { Shell } from '../components/ui'
import { FARMS } from '../data'

export default function About() {
  return (
    <section id="about" className="scroll-mt-24 bg-night-soft py-20 lg:py-28">
      <Shell className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <Reveal from="left">
          {/* The same drawn frame as the hero, on the other diagonal — it is the
              page's one repeated ornament and it should read as a set, not as a
              one-off in the hero. */}
          <PhotoFrame corners="tr-bl" delay={250}>
            <Photo
              name="shelf_jars"
              alt="Flower jars on the shelf"
              className="aspect-[4/5] rounded-2xl"
            />
          </PhotoFrame>
        </Reveal>

        <div>
          <Reveal from="right" delay={100}>
            <p className="eyebrow">Our approach</p>
          </Reveal>

          <h2 className="mt-3 font-serif text-3xl leading-snug text-cream sm:text-4xl">
            <WordReveal
              text="We don’t stock everything.|We choose."
              delay={160}
              accent={{ words: ['choose'], className: 'text-gold' }}
            />
          </h2>

          <Reveal from="right" delay={220}>

          <p className="mt-6 text-sm leading-relaxed text-cream/70">
            &ldquo;Select shop&rdquo; is the whole idea behind MAYA GREEN — a place that chooses
            rather than hoards. We work with a Thai farm certified to GACP, the international
            standard for the cultivation and harvesting of medicinal plants.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-cream/70">
            The shop is Japanese-owned and Japanese-operated, and the flower on the shelf comes from
            farms we handle ourselves. International medical grade only — that is the floor, not the
            headline.
          </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {FARMS.map((farm) => (
                <span
                  key={farm}
                  className="rounded-full border border-gold/40 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-gold transition-all duration-500 hover:border-gold hover:bg-gold/10 hover:shadow-[0_0_22px_-6px_rgba(239,199,94,0.8)]"
                >
                  {farm}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </Shell>
    </section>
  )
}
