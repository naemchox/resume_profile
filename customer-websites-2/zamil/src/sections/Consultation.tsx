import Aurora from '../components/Aurora'
import Photo from '../components/Photo'
import Reveal from '../components/Reveal'
import WordReveal from '../components/WordReveal'
import { Shell } from '../components/ui'
import { BRAND, PHONE_DISPLAY, PHONE_HREF } from '../data'

/**
 * The medical-use note. Thailand moved cannabis to medical-only with PT 33
 * prescription requirements, and the shop's own bio leans on that language. What
 * the site can say is that we supply for medical purposes and that prescription
 * questions are answered in store — not what cannabis does for you.
 */
export default function Consultation() {
  return (
    <section className="relative overflow-hidden bg-night-soft py-20 lg:py-24">
      <Aurora />

      <Shell className="relative z-10 grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal from="left">
            <p className="eyebrow">Our criteria</p>
          </Reveal>

          <h2 className="mt-3 font-serif text-3xl leading-snug text-cream sm:text-4xl">
            <WordReveal
              text="If we’re not sure,|we don’t sell it."
              delay={120}
              accent={{ words: ['sell', 'it'], className: 'text-gold' }}
            />
          </h2>

          <Reveal from="left" delay={180}>
            <p className="mt-6 text-sm leading-relaxed text-cream/70">
            {BRAND} supplies cannabis for medical purposes under Thai law. Ask us in store about
            prescription requirements — we would rather answer the question properly than sell you
            something first.
            </p>

            <p className="mt-4 text-sm leading-relaxed text-cream/70">
              Our selection turns over with each harvest. If you are travelling far, a quick call
              saves you the trip.
            </p>

            <a href={PHONE_HREF} className="btn-gold mt-8">
              Call {PHONE_DISPLAY}
            </a>
          </Reveal>
        </div>

        <Reveal from="right" delay={100}>
          <Photo
            name="brand_wall"
            alt="The gold wordmark and leaf on the living plant wall"
            className="neon-edge aspect-[3/2] rounded-2xl"
          />
        </Reveal>
      </Shell>
    </section>
  )
}
