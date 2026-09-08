import { useEffect, useState } from 'react'

/**
 * Gold hairline across the top, filling as you scroll. The listener is passive
 * and writes one number per frame at most — the value is read in the handler but
 * committed inside a rAF, so a fast trackpad flick can't queue up layout work.
 */
export default function ScrollProgress() {
  const [ratio, setRatio] = useState(0)

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setRatio(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0)
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div className="fixed inset-x-0 top-0 z-[70] h-px bg-transparent" aria-hidden="true">
      <div
        className="h-full origin-left bg-gradient-to-r from-gold/40 via-gold to-neon-green"
        style={{ transform: `scaleX(${ratio})`, transition: 'transform 120ms linear' }}
      />
    </div>
  )
}
