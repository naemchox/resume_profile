import { Instagram, Twitter } from 'lucide-react'
import LeafGlyph from '../components/LeafGlyph'
import Reveal from '../components/Reveal'
import { Shell } from '../components/ui'
import {
  ADDRESS_LINES,
  BRAND,
  BRAND_FULL,
  EXPLORE,
  HOURS,
  INSTAGRAM,
  MAPS_URL,
  PHONE_DISPLAY,
  PHONE_HREF,
  TWITTER,
} from '../data'

/* Facebook, LINE and TikTok are deliberately absent: no account was found for
   the shop on any of them. See FACTS.md. */
const SOCIAL = [
  { icon: Instagram, label: `Instagram ${INSTAGRAM.handle}`, href: INSTAGRAM.href },
  { icon: Twitter, label: `X ${TWITTER.handle}`, href: TWITTER.href },
]

/* The photo strip that used to sit in this column is gone. Every thumbnail in it
   was a frame already shown further up the page — with seven frames in the whole
   library, a footer gallery is repetition, not reassurance. */
const RULES = [
  '20 and over only — ID or passport, checked at the counter.',
  'Not for sale to pregnant or breastfeeding women.',
  "Walk-in only. We don't take online orders and we don't deliver.",
  'Supplied for medical purposes under Thai law. No medical advice is given here.',
]

export default function Footer() {
  return (
    <footer className="bg-night">
      <Shell className="grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <Reveal>
          <h3 className="font-serif text-lg text-cream">Explore</h3>
          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
            {EXPLORE.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="text-xs text-cream/60 transition-colors hover:text-gold"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex gap-4">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/20 text-cream/60 transition-all hover:-translate-y-0.5 hover:border-gold hover:text-gold"
              >
                <s.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <h3 className="font-serif text-lg text-cream">Opening hours</h3>
          <ul className="mt-5 space-y-3">
            {HOURS.map(([day, time]) => (
              <li key={day} className="flex justify-between gap-4 text-xs text-cream/60">
                <span>{day}</span>
                <span className={time === 'Closed' ? 'text-gold' : 'text-cream/85'}>{time}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal>
          <h3 className="font-serif text-lg text-cream">Visit</h3>
          <address className="mt-5 space-y-1 text-xs not-italic leading-relaxed text-cream/60">
            {ADDRESS_LINES.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </address>
          <a
            href={PHONE_HREF}
            className="mt-3 block text-xs text-cream/85 transition-colors hover:text-gold"
          >
            {PHONE_DISPLAY}
          </a>
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-block text-[10px] uppercase tracking-widest text-gold transition-opacity hover:opacity-75"
          >
            Open in Google Maps
          </a>
        </Reveal>

        <Reveal>
          <h3 className="font-serif text-lg text-cream">House rules</h3>
          <ul className="mt-5 space-y-3">
            {RULES.map((rule) => (
              <li key={rule} className="flex gap-2 text-[11px] leading-relaxed text-cream/55">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                {rule}
              </li>
            ))}
          </ul>
        </Reveal>
      </Shell>

      <div className="border-t border-cream/10">
        <Shell className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <span className="flex items-center gap-2 font-serif text-lg text-cream">
            <LeafGlyph className="h-4 w-4 text-gold" />
            {BRAND}
          </span>
          <p className="text-center text-[10px] uppercase tracking-widest text-cream/40">
            © 2026 {BRAND_FULL}
          </p>
          <p className="text-center text-[10px] text-cream/70">20+ only. ID required.</p>
        </Shell>
      </div>
    </footer>
  )
}
