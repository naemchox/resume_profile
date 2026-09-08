import { useEffect, useRef } from 'react'
import { createTimeline, stagger, utils } from 'animejs'
import { Check, Clock } from 'lucide-react'
import Aurora from '../components/Aurora'
import LeafGlyph from '../components/LeafGlyph'
import Motes from '../components/Motes'
import NeonLeafMark from '../components/NeonLeafMark'
import Photo from '../components/Photo'
import PhotoFrame from '../components/PhotoFrame'
import WordReveal from '../components/WordReveal'
import { Shell } from '../components/ui'
import { useParallax } from '../hooks/useParallax'
import { reducedMotion } from '../motion'
import { BRAND, FLOWER_PRICE, HOURS_CLOSED, HOURS_SHORT, baht } from '../data'

/** Each of these is a confirmed fact, not a slogan — see FACTS.md. */
const POINTS = [
  'GACP-certified Thai farm',
  'International medical grade only',
  `One price, every strain — ${baht(FLOWER_PRICE)} per gram`,
]

export default function Hero() {
  const plate = useParallax<HTMLDivElement>(18)
  // The sign drifts slower than the photograph it sits over, which is the whole
  // of the depth effect — two speeds, not two layers.
  const sign = useParallax<HTMLDivElement>(40)
  const root = useRef<HTMLElement>(null)

  /**
   * The hero's arrival, as one timeline.
   *
   * This was six elements each carrying its own delay — a `Reveal delay={120}`,
   * a `WordReveal delay={420}`, and four brackets with hand-written 700 / 820 /
   * 940 / 1060ms transition delays. Every one of those numbers had to be held in
   * someone's head against every other, and inserting a beat anywhere meant
   * editing all of them. Here the order is written as an order, and the whole
   * arrival is one seekable object: `hero.seek(hero.duration * 0.5)` in the
   * console gives the exact middle frame.
   *
   * The headline is not in it on purpose — `WordReveal` owns its own stagger,
   * and reaching into another component's spans to time them from here is how
   * this file ends up with eight magic numbers again.
   */
  useEffect(() => {
    const el = root.current
    if (!el) return

    const bullets = el.querySelectorAll<HTMLLIElement>('[data-hero-point]')
    const supporting = el.querySelectorAll<HTMLElement>('[data-hero-fade]')
    const neon = el.querySelector<HTMLElement>('[data-hero-neon]')
    const hours = el.querySelector<HTMLElement>('[data-hero-hours]')

    if (reducedMotion()) {
      utils.set([...supporting, ...bullets], { opacity: 1 })
      if (neon) utils.set(neon, { opacity: 1 })
      if (hours) utils.set(hours, { opacity: 1 })
      return
    }

    const timeline = createTimeline({ defaults: { duration: 900, ease: 'outQuint' } })
      .add(supporting, { opacity: [0, 1], y: [16, 0], delay: stagger(90) }, 620)
      .add(bullets, { opacity: [0, 1], x: [-14, 0], delay: stagger(90) }, 900)

    /* The sign strikes twice on the transformer and holds — the flicker is a
       set of hard cuts, so each step is its own `to` with a duration rather than
       an eased tween between them. It is here, and not in CSS beside the
       breathing glow, because when it fires relative to the rest of the hero is
       the point of it. */
    if (neon) {
      timeline.add(
        neon,
        {
          opacity: [
            { to: 0, duration: 0 },
            { to: 0.85, duration: 60 },
            { to: 0.08, duration: 50 },
            { to: 0.9, duration: 70 },
            { to: 0.12, duration: 60 },
            { to: 1, duration: 90 },
            { to: 0.3, duration: 70 },
            { to: 1, duration: 120 },
          ],
          ease: 'linear',
        },
        400,
      )
    }

    if (hours) {
      timeline.add(hours, { opacity: [0, 1], y: [18, 0], scale: [0.96, 1], duration: 1000 }, 1150)
    }

    return () => {
      timeline.revert()
    }
  }, [])

  return (
    /* Near-black rather than forest green: the real shopfront is gold on black,
       and the pools of light are the lounge's violet and green cove lighting.
       Both belong to the shop — neither was in the palette before. */
    <section
      ref={root}
      id="top"
      className="relative overflow-hidden bg-night pb-32 pt-32 sm:pt-36 lg:pb-44 lg:pt-44"
    >
      <Aurora />
      <Motes />

      {/* The sign, at the size a sign is. Everything decorative on this page used
          to be a 12px glyph or a 3%-opacity texture; this is the one element
          allowed to be large, and it is the shop's own mark — a leaf in neon
          tube, which is literally what hangs over the door.

          Straddling the photograph's left edge rather than sitting behind it:
          tucked behind, the whole mark was hidden and only two stray blades
          cleared the corner, which read as a rendering fault. Half on the dark
          background and half on the shopfront, in screen blend, it reads as
          what it is — a lit sign in front of a window. */}
      <div
        ref={sign.ref}
        aria-hidden="true"
        className="pointer-events-none absolute left-[42%] top-2 z-20 hidden mix-blend-screen lg:block"
      >
        <span data-hero-neon className="block opacity-0">
          <NeonLeafMark strike={false} className="h-80 w-80 text-gold/50" />
        </span>
      </div>

      <Shell className="relative z-10 grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <div className="relative z-10">
          <p data-hero-fade className="eyebrow flex items-center gap-2 opacity-0">
            <LeafGlyph className="h-3 w-3 text-gold" />
            Ekkamai · Bangkok
          </p>

          {/* The name is set word by word rather than faded in as a block. It is
              the one heading on the page that is also a shop sign, so it gets
              the treatment that reads as type being set. */}
          <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.05] text-cream sm:text-[3.2rem] lg:text-[3.8rem]">
            <span className="underline-grow neon-text">
              <WordReveal text={BRAND} stagger={90} delay={150} />
            </span>
            <br />
            <WordReveal text="Selected Cannabis Boutique" stagger={70} delay={420} />
          </h1>

          <p data-hero-fade className="mt-7 max-w-md text-sm leading-relaxed text-cream/70 opacity-0">
            Medical-grade flower to an international standard, from a GACP-certified Thai farm —
            chosen one harvest at a time, and kept the way it deserves to be kept.
          </p>

          <ul className="mt-7 space-y-3.5">
            {POINTS.map((point) => (
              <li
                key={point}
                data-hero-point
                className="group flex items-center gap-3 text-sm text-cream/85 opacity-0"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold transition-transform duration-500 group-hover:scale-110">
                  <Check className="h-3.5 w-3.5 text-forest-dark" />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <div data-hero-fade className="mt-10 flex flex-wrap items-center gap-4 opacity-0">
            <a href="#products" className="btn-gold">
              See the selection
            </a>
            <a href="#contact" className="btn-outline">
              Come to the shop
            </a>
          </div>
        </div>

        {/* Bleeds past the container on large screens so the page doesn't read as
            two equal boxes side by side. Capped at 4rem: tying it to
            (100vw - shell)/2 alone makes it grow without limit on ultrawide
            screens and at low browser zoom. */}
        <div className="relative lg:-mr-[min(4rem,max(0px,calc((100vw-1180px)/2+1.5rem)))]">
          <PhotoFrame delay={700}>
            <div ref={plate.ref}>
              <Photo
                name="storefront_night"
                alt="The MAYA GREEN frontage at night, sign lit"
                position="55% center"
                priority
                className="neon-edge aspect-[4/3] rounded-2xl sm:aspect-[16/10] lg:aspect-auto lg:h-[32rem] lg:rounded-l-2xl lg:rounded-r-none"
              />
            </div>
          </PhotoFrame>

          {/* Floating card, overlapping the image edge for depth. The opening
              hours are the one thing a walk-in shop's visitor needs first — and
              the Tuesday closure is real, so it is stated rather than buried. */}
          <div
            data-hero-hours
            className="absolute -bottom-6 left-4 flex items-center gap-3 rounded-2xl bg-cream px-5 py-4 opacity-0 shadow-xl shadow-black/25 sm:left-8 lg:-left-8"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night">
              <Clock className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink-soft/70">Opening hours</p>
              <p className="mt-1 text-xs font-medium text-ink">{HOURS_SHORT}</p>
              <p className="text-[10px] text-ink-soft">{HOURS_CLOSED}</p>
            </div>
          </div>
        </div>
      </Shell>
    </section>
  )
}
