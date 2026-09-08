import Reveal from './Reveal'
import VineRule from './VineRule'
import WordReveal from './WordReveal'

export function Shell({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`mx-auto w-full max-w-shell px-6 ${className}`}>{children}</div>
}

/**
 * The shared section head: eyebrow, title, rule.
 *
 * The title is set word by word rather than faded as a block, and the rule under
 * it draws itself. Both matter more here than anywhere else on the page, because
 * this component is the thing that repeats — seven identical fades under seven
 * identical hairlines was most of why the page read flat.
 *
 * `title` is plain text; write a hard line break as `|`.
 */
export function SectionTitle({
  eyebrow,
  title,
  accent,
  accentClass,
  tone = 'gold',
}: {
  eyebrow: string
  title: string
  /** One word set in the accent colour, the way "choose" and "neon" already are. */
  accent?: string
  /** Overrides the default gold — Room's "neon" is set in the neon green. */
  accentClass?: string
  /** `gold` on the dark bands, `ink` on the cream ones. */
  tone?: 'gold' | 'ink'
}) {
  const dark = tone === 'gold'

  return (
    <div className="text-center">
      <Reveal>
        <p className={dark ? 'eyebrow' : 'text-[10px] uppercase tracking-[0.35em] text-gold-dark'}>
          {eyebrow}
        </p>
      </Reveal>

      <h2
        className={`mt-3 font-serif text-3xl leading-snug sm:text-4xl ${
          dark ? 'text-cream' : 'text-ink'
        }`}
      >
        <WordReveal
          text={title}
          delay={90}
          accent={
            accent
              ? {
                  words: [accent],
                  className: accentClass ?? (dark ? 'text-gold' : 'text-gold-dark'),
                }
              : undefined
          }
        />
      </h2>

      <VineRule tone={tone} className="mt-6" />
    </div>
  )
}
