import { useReveal } from '../hooks/useReveal'

type Props = {
  children: React.ReactNode
  /** Stagger in milliseconds, applied as a transition delay. */
  delay?: number
  /** Direction the element travels in from. `fade` moves not at all. */
  from?: 'up' | 'left' | 'right' | 'scale' | 'fade'
  /** Overrides the shared 520ms. Longer suits large, quiet elements. */
  duration?: number
  className?: string
}

const OFFSET: Record<NonNullable<Props['from']>, string> = {
  up: 'translateY(20px)',
  left: 'translateX(-20px)',
  right: 'translateX(20px)',
  scale: 'scale(0.97)',
  fade: 'none',
}

/**
 * The shared curve is an expo-out: it covers most of its distance in the first
 * fifth of the duration, which suits something arriving from an offset but
 * makes a plain fade look fast however long you make it. Fades get an
 * ease-in-out instead, so the opacity actually spends its time in the middle.
 */
const FADE_EASING = 'cubic-bezier(0.37, 0, 0.63, 1)'

export default function Reveal({
  children,
  delay = 0,
  from = 'up',
  duration,
  className = '',
}: Props) {
  // Everything on the page now fades over a second or more, so every reveal
  // starts while it is still below the fold. Without the head start, someone
  // scrolling at a normal pace reaches each block while it is still half
  // transparent.
  const { ref, revealed } = useReveal<HTMLDivElement>('0px 0px 25% 0px')

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'none' : OFFSET[from],
        transitionDelay: `${delay}ms`,
        transitionDuration: duration ? `${duration}ms` : undefined,
        transitionTimingFunction: from === 'fade' ? FADE_EASING : undefined,
      }}
    >
      {children}
    </div>
  )
}
