import { useState } from 'react'
import { CalendarClock, Clock, IdCard, Instagram, MapPin, Phone, Stethoscope, Twitter } from 'lucide-react'
import Photo from '../components/Photo'
import Reveal from '../components/Reveal'
import { Shell, SectionTitle } from '../components/ui'
import { useFormSubmit } from '../hooks/useFormSubmit'
import {
  ADDRESS_LINES,
  BRAND,
  HOURS,
  INSTAGRAM,
  MAPS_URL,
  PHONE_DISPLAY,
  PHONE_HREF,
  TWITTER,
} from '../data'

/** Everything a walk-in needs to know before they get on the BTS. */
const BEFORE = [
  {
    icon: IdCard,
    title: '20 and over',
    body: "Please bring ID or a passport. We don't sell to anyone under 20, or to pregnant or breastfeeding women.",
  },
  {
    icon: CalendarClock,
    title: 'Call ahead',
    body: "Our selection turns over with each harvest. If you're travelling far, a quick call saves you the trip.",
  },
  {
    icon: Stethoscope,
    title: 'Medical use',
    body: `${BRAND} supplies cannabis for medical purposes under Thai law. Ask us in store about prescription requirements.`,
  },
]

export default function Contact() {
  const [values, setValues] = useState({ name: '', email: '', message: '' })
  const [touched, setTouched] = useState(false)
  const { state, submit } = useFormSubmit()

  const errors = {
    name: values.name.trim().length < 2 ? 'Please enter your name.' : '',
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ? '' : 'Please enter a valid email.',
    message: values.message.trim().length < 10 ? 'Tell us a little more (10+ characters).' : '',
  }
  const valid = !errors.name && !errors.email && !errors.message

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (valid) submit(values)
  }

  const set =
    (key: keyof typeof values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }))

  const field =
    'w-full rounded-xl border bg-cream/5 px-4 py-3 text-sm text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-gold'

  return (
    <section id="contact" className="leaf-texture scroll-mt-24 bg-night py-20 lg:py-24">
      <Shell>
        <SectionTitle
          eyebrow="Visit us"
          title={
            <>
              Soi Pridi
              <br />
              Banomyong <span className="text-gold">40</span>
            </>
          }
        />
        <Reveal delay={80}>
          <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-cream/60">
            Ekkamai, Watthana, Bangkok — drop in, ask us anything. No appointment needed. We sell
            over the counter only; there is no online ordering and no delivery.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <Reveal from="left">
            <div className="space-y-7">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold">
                  <MapPin className="h-5 w-5 text-forest-dark" />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-cream/45">Address</p>
                  {ADDRESS_LINES.map((line) => (
                    <p key={line} className="text-sm text-cream">
                      {line}
                    </p>
                  ))}
                  <a
                    href={MAPS_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-[11px] uppercase tracking-widest text-gold transition-opacity hover:opacity-75"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold">
                  <Phone className="h-5 w-5 text-forest-dark" />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-cream/45">Phone</p>
                  <a href={PHONE_HREF} className="text-sm text-cream transition-colors hover:text-gold">
                    {PHONE_DISPLAY}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold">
                  <Clock className="h-5 w-5 text-forest-dark" />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-cream/45">Open</p>
                  <ul className="mt-1 space-y-1">
                    {HOURS.map(([day, time]) => (
                      <li key={day} className="flex gap-3 text-sm text-cream">
                        <span className="text-cream/60">{day}</span>
                        <span className={time === 'Closed' ? 'text-gold' : undefined}>{time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={INSTAGRAM.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full border border-cream/20 px-4 py-2 text-xs text-cream/70 transition-all hover:-translate-y-0.5 hover:border-gold hover:text-gold"
                >
                  <Instagram className="h-4 w-4" />
                  {INSTAGRAM.handle}
                </a>
                <a
                  href={TWITTER.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full border border-cream/20 px-4 py-2 text-xs text-cream/70 transition-all hover:-translate-y-0.5 hover:border-gold hover:text-gold"
                >
                  <Twitter className="h-4 w-4" />
                  {TWITTER.handle}
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal from="right" delay={100}>
            <figure>
              <Photo
                name="storefront_day"
                alt="The frontage by day, seen from the street"
                className="neon-edge aspect-[4/5] rounded-2xl"
              />
              <figcaption className="mt-3 text-[10px] uppercase tracking-[0.25em] text-cream/40">
                The frontage by day
              </figcaption>
            </figure>
          </Reveal>
        </div>

        {/* Before you come */}
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {BEFORE.map((item, i) => (
            <Reveal key={item.title} delay={i * 70}>
              <div className="h-full rounded-2xl border border-cream/10 px-6 py-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/40">
                  <item.icon className="h-4 w-4 text-gold" />
                </span>
                <h3 className="mt-5 font-serif text-lg text-cream">{item.title}</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-cream/60">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Message form. The shop has no published email address, so this is the
            one channel that needs wiring before launch — see README. */}
        <Reveal delay={80} className="mx-auto mt-16 max-w-xl">
          <h3 className="text-center font-serif text-2xl text-cream">Send us a message</h3>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-cream/50">
            Or reach us faster on Instagram — we read DMs during opening hours.
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
            <div>
              <label htmlFor="c-name" className="sr-only">
                Your name
              </label>
              <input
                id="c-name"
                value={values.name}
                onChange={set('name')}
                placeholder="Your name"
                className={`${field} ${touched && errors.name ? 'border-[#E0736B]' : 'border-cream/15'}`}
              />
              {touched && errors.name && (
                <p className="mt-1 text-[11px] text-[#E0736B]">{errors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="c-email" className="sr-only">
                Your email
              </label>
              <input
                id="c-email"
                type="email"
                value={values.email}
                onChange={set('email')}
                placeholder="Your email"
                className={`${field} ${touched && errors.email ? 'border-[#E0736B]' : 'border-cream/15'}`}
              />
              {touched && errors.email && (
                <p className="mt-1 text-[11px] text-[#E0736B]">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="c-message" className="sr-only">
                Your message
              </label>
              <textarea
                id="c-message"
                rows={5}
                value={values.message}
                onChange={set('message')}
                placeholder="How can we help?"
                className={`${field} resize-none ${
                  touched && errors.message ? 'border-[#E0736B]' : 'border-cream/15'
                }`}
              />
              {touched && errors.message && (
                <p className="mt-1 text-[11px] text-[#E0736B]">{errors.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={state === 'sending'}
              className="btn-gold w-full disabled:opacity-60"
            >
              {state === 'sending' ? 'Sending…' : 'Send message'}
            </button>

            {state === 'sent' && (
              <p className="text-center text-xs text-gold">
                Thanks — we&rsquo;ll get back to you during opening hours.
              </p>
            )}
            {state === 'error' && (
              <p className="text-center text-xs text-[#E0736B]">
                Something went wrong. Please call {PHONE_DISPLAY} instead.
              </p>
            )}
            {state === 'unconfigured' && (
              <p className="text-center text-xs text-[#E0736B]">
                This form isn&rsquo;t connected yet — set <code>VITE_CONTACT_ENDPOINT</code> in{' '}
                <code>.env</code> before going live.
              </p>
            )}
          </form>
        </Reveal>
      </Shell>
    </section>
  )
}
