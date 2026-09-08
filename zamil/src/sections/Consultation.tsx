import Photo from '../components/Photo'
import Reveal from '../components/Reveal'
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
    <section className="haze relative overflow-hidden bg-night-soft py-20 lg:py-24">
      <Shell className="relative grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <Reveal from="left">
          <p className="eyebrow">Our criteria</p>
          <h2 className="mt-3 font-serif text-3xl leading-snug text-cream sm:text-4xl">
            If we&rsquo;re not sure,
            <br />
            we don&rsquo;t <span className="text-gold">sell it</span>.
          </h2>

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
