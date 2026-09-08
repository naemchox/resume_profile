/**
 * The page's motion vocabulary, in one place.
 *
 * Everything scriptable now runs on Anime.js v4 — one engine, one clock. What
 * stays in CSS is the set of things a compositor can run on its own forever and
 * a JS engine cannot run more cheaply: the aurora pools, the motes, the neon
 * breathe, and the hover transitions. Handing those to a library would mean
 * fifteen infinite JS animations ticking behind a page that is mostly read, not
 * watched.
 *
 * What Anime.js took over is everything with a *sequence* or a *scroll position*
 * in it: the hero's arrival, the drawn frames and rules, the counters, and the
 * parallax — which was a hand-rolled requestAnimationFrame loop sitting next to
 * an IntersectionObserver, i.e. two clocks doing what one now does.
 */

/** Reduced motion is checked in JS, not only in CSS: the media-query override in
 *  index.css can flatten a transition, but it cannot flatten a value we compute
 *  and write from a script. */
export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Runs `start` once, the first time the element is 60px inside the viewport —
 * including immediately, if it is already there when the page loads.
 *
 * This is an IntersectionObserver and not Anime.js's own `onScroll()`, and the
 * distinction cost an afternoon, so it is written down. `onScroll` resolves its
 * thresholds against the page's measurements at the moment the observer is
 * built. Every photograph on this page loads *after* that moment, the document
 * grows by several thousand pixels, and the thresholds it computed are now for a
 * page that no longer exists — so reveals fire late, in the wrong order, or (for
 * anything above the fold on a visitor who lands and does not scroll) never. A
 * scroll of any distance re-measures and hides the whole thing, which is exactly
 * why it survives casual testing: you scroll, so you never see it.
 *
 * IntersectionObserver has no thresholds to go stale. It is recomputed by the
 * browser whenever layout changes, and it delivers a first callback for every
 * element it is given, in view or not.
 *
 * So: this fires the animations, and Anime.js runs them. `onScroll` still drives
 * the parallax in `useParallax`, where being tied to the scroll *position* is the
 * entire point and any staleness corrects itself on the next scroll — and where
 * it is explicitly refreshed on `load` anyway.
 */
export function onceInView(element: Element, start: () => void) {
  let fired = false

  const fire = () => {
    if (fired) return
    fired = true
    observer.disconnect()
    start()
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) fire()
    },
    // Zero threshold with the bottom edge pulled in: it fires when any part of
    // the element is 60px past the fold, which is right for a block taller than
    // the viewport as well as for a one-line heading. A ratio-based threshold is
    // not — a section 3000px tall never reaches 12% of itself on screen.
    { threshold: 0, rootMargin: '0px 0px -60px 0px' },
  )

  observer.observe(element)

  /* And one measurement of our own, on the next frame.
   *
   * The observer is the right mechanism for everything below the fold and it is
   * left to do that job. What it is not reliable about, in this page, is the
   * element that is already on screen when the observer is created: the headings
   * here are inline `<span>`s inside an `<h1>`, and the first callback for those
   * did not arrive — the hero's own title stayed hidden on a visitor who landed
   * and did not scroll, which is the one visitor who sees only the hero.
   *
   * A rect is not a mechanism that can fail to deliver. If the element is
   * already in view a frame after mount, start; otherwise leave it to the
   * observer, which handles arrivals correctly. Whichever gets there first wins
   * and the other is disconnected.
   */
  requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect()
    const visible = rect.top < window.innerHeight - 60 && rect.bottom > 0
    if (visible) fire()
  })

  return () => observer.disconnect()
}

/**
 * The house eases.
 *
 * `rise` is a quint-out: nearly all of its distance in the first third, then a
 * long settle. It is the reason the type reads as arriving rather than sliding.
 * An expo-out — the obvious pick — is so front-loaded that every duration looks
 * the same length.
 */
/**
 * A warning worth more than an ease.
 *
 * Anime.js's transform shorthands (`x`, `y`, `scale`…) take a percentage without
 * complaint and then do nothing with it — the animation runs, reports progress
 * and completes, and the element never moves. Keep starting positions expressed
 * as percentages in CSS, where they belong and where they work, and give the
 * library plain numbers.
 */
export const EASE = {
  rise: 'outQuint',
  /** Cubic-out, for numbers counting to a value. Decelerates into the figure. */
  count: 'out(3)',
  /** Symmetric, for a line drawing itself: a stroke starts and stops. */
  draw: 'inOutQuad',
} as const
