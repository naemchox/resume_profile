import { DIMENSIONS, IMAGES } from '../images'

type Props = {
  /** Key into IMAGES. */
  name: string
  /** Alt text, also shown as the placeholder label when no source exists. */
  alt: string
  className?: string
  tone?: 'dark' | 'light'
  /** CSS object-position, for steering the crop (e.g. '75% center'). */
  position?: string
  /** Set on the LCP image only — lazy-loading it delays first paint. */
  priority?: boolean
}

/**
 * Renders the real photo when one is configured, otherwise a styled block
 * so the layout still reads correctly.
 */
export default function Photo({
  name,
  alt,
  className = '',
  tone = 'dark',
  position,
  priority = false,
}: Props) {
  const src = IMAGES[name]
  const size = DIMENSIONS[name]

  if (src) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <img
          src={src}
          alt={alt}
          width={size?.[0]}
          height={size?.[1]}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          /* React 18 has no typed prop for this, and it is the one hint that
             actually moves the LCP image up the request queue. */
          {...(priority ? { fetchpriority: 'high' } : null)}
          style={position ? { objectPosition: position } : undefined}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  const bg =
    tone === 'dark'
      ? 'bg-gradient-to-br from-night-soft via-night to-black'
      : 'bg-gradient-to-br from-cream via-[#e6e0cf] to-[#cfc7b0]'
  const fg = tone === 'dark' ? 'text-cream/35' : 'text-forest/40'

  return (
    <div className={`relative overflow-hidden ${bg} ${className}`}>
      <div className={`absolute inset-0 flex items-center justify-center ${fg}`}>
        <span className="px-3 text-center text-[10px] uppercase tracking-[0.25em]">{alt}</span>
      </div>
    </div>
  )
}
