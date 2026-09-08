import { useEffect, useState } from 'react'
import { reducedMotion } from '../motion'

/**
 * Counts from zero to `target` once `active` turns true.
 *
 * The two numbers that carry this shop — one flat price, and a THC percentage
 * per strain — were both set as static text. A number that arrives at its value
 * is read; a number that is simply present is skimmed. That is the whole reason
 * this exists.
 *
 * This is the one place on the page that is deliberately NOT Anime.js. The
 * library animates plain objects, and `animate(state, { n: target })` is a
 * tempting one-liner for exactly this — but it did not tick here, the price
 * rendered as ฿0 and all eight meters as 0%, and it failed the way everything
 * else in this integration failed: silently, with the animation reporting itself
 * as running. Twenty lines of `requestAnimationFrame` that visibly work beat a
 * one-liner that needs a screenshot to prove it. Anime.js earns its place on
 * this page driving the DOM, where it is doing something a hand-rolled loop
 * genuinely should not.
 */
export function useCountUp(target: number, active: boolean, duration = 1300) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return

    if (reducedMotion()) {
      setValue(target)
      return
    }

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // Ease-out cubic, so it decelerates into the real figure rather than
      // stopping dead on it.
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, active, duration])

  return value
}
