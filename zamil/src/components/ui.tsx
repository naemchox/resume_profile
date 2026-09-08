import Reveal from './Reveal'

export function Shell({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`mx-auto w-full max-w-shell px-6 ${className}`}>{children}</div>
}

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: React.ReactNode }) {
  return (
    <Reveal className="text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-3xl leading-snug text-cream sm:text-4xl">{title}</h2>
    </Reveal>
  )
}
