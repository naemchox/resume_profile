import { Fragment, useEffect, useRef } from 'react'
import { animate, stagger, utils } from 'animejs'
import { EASE, onceInView, reducedMotion } from '../motion'

type Props = {
  /** Plain text. Line breaks are written as `|`. */
  text: string
  /** Milliseconds between one word starting and the next. */
  stagger?: number
  /** Delay before the first word, for staggering against a neighbouring block. */
  delay?: number
  className?: string
  /** Applied to the words listed here, so one word in a heading can be gold. */
  accent?: { words: string[]; className: string }
}

/**
 * A heading that rises out of its own baseline, one word after the next.
 *
 * Every other reveal on this page is a fade with 20px of travel, and eight of
 * them in a row is why the page read as one long dissolve. This one moves the
 * type itself: each word sits in a mask the height of its own line and slides up
 * out of it, which reads as type being set rather than as a slide arriving.
 *
 * The words are wrapped, not substituted — the heading is still a heading, still
 * announces as one string, and still copies as a sentence. `splitText()` would
 * do the wrapping for us, but it rewrites the DOM React just rendered, and the
 * two would fight on the next render; the accent word also has to survive the
 * split, and here it is simply a class on the span React already made.
 *
 * The stagger carries its own ease. A linear one hands every word the same slice
 * of time, which on a six-word line reads as a conveyor; `inQuad` lets the tail
 * of the line catch up with the head, which reads as a phrase.
 */
export default function WordReveal({
  text,
  stagger: step = 65,
  delay = 0,
  className = '',
  accent,
}: Props) {
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return

    const words = el.querySelectorAll<HTMLSpanElement>('.word-mask > span')
    if (!words.length) return

    if (reducedMotion()) {
      utils.set(words, { y: 0 })
      return
    }

    /* Built at arrival rather than at mount, for one reason: the distance.
     *
     * The starting position is a percentage, and it has to be — it is in the
     * stylesheet, where it holds every word below its own mask from the first
     * paint, at any type size, before a line of script has run. Anime.js will
     * not animate that percentage. `y: ['112%', '0%']` produces an animation
     * that reports itself as running, ticks, completes — and never moves the
     * element one pixel. No error, no warning: the transform shorthand takes the
     * unit and quietly does nothing with it, and the heading simply stays hidden
     * forever. It cost most of an afternoon to find, so: on this page, animate
     * transforms in NUMBERS.
     *
     * Which means measuring. A word's box is its line box, so one measurement
     * covers every word in the heading — and taken here, at arrival, it is taken
     * after the webfont has loaded and settled, which a measurement at mount
     * would not be. */
    let animation: ReturnType<typeof animate> | null = null

    const stopWatching = onceInView(el, () => {
      const line = words[0].offsetHeight || words[0].getBoundingClientRect().height
      const rise = Math.max(24, line * 1.12)

      animation = animate(words, {
        y: [rise, 0],
        duration: 950,
        ease: EASE.rise,
        delay: stagger(step, { start: delay, ease: 'inQuad' }),
      })
    })

    return () => {
      stopWatching()
      animation?.revert()
    }
  }, [text, step, delay])

  // `|` marks a hard break the designer chose; everything else splits on spaces.
  const lines = text.split('|').map((line) => line.trim().split(/\s+/))
  let index = 0

  return (
    <span ref={root} className={className}>
      {lines.map((words, l) => (
        <span key={l}>
          {words.map((word) => {
            const at = index++
            const isAccent = accent?.words.includes(word.replace(/[.,—]/g, ''))
            return (
              // The space is a sibling of the mask rather than a child: inside
              // an overflow-clipped inline-block it collapses, and the heading
              // sets as one run-on word.
              <Fragment key={`${word}-${at}`}>
                <span className="word-mask">
                  <span className={isAccent ? accent!.className : undefined}>{word}</span>
                </span>{' '}
              </Fragment>
            )
          })}
          {l < lines.length - 1 && <br />}
        </span>
      ))}
    </span>
  )
}
