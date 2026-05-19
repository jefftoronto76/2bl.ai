import {
  TrendingUp,
  Handshake,
  Users,
  Layers,
  Unlock,
  Telescope,
} from 'lucide-react'

type Outcome = {
  Icon: typeof TrendingUp
  title: string
  bodyLead: string
  bodyMark: string
  bodyTrail: string
}

const OUTCOMES: Outcome[] = [
  {
    Icon: TrendingUp,
    title: 'Stronger revenue',
    bodyLead: 'Teams that learn fast, stay disciplined, and ',
    bodyMark: 'beat their number',
    bodyTrail: '.',
  },
  {
    Icon: Handshake,
    title: 'Resilient client relationships',
    bodyLead: 'Strong customer relationships drive ',
    bodyMark: 'retention, expansion, and advocacy',
    bodyTrail: '.',
  },
  {
    Icon: Users,
    title: 'Teamwork that compounds',
    bodyLead: 'Built on focus, the courage to fail, and ',
    bodyMark: 'a commitment to making each other better',
    bodyTrail: '.',
  },
  {
    Icon: Layers,
    title: 'Businesses that run themselves',
    bodyLead: 'People grow. Systems improve. ',
    bodyMark: 'Profits compound',
    bodyTrail: '.',
  },
  {
    Icon: Unlock,
    title: 'Unstuck',
    bodyLead: 'Find the ',
    bodyMark: 'real constraint',
    bodyTrail: ' behind stalled growth, teams, or execution.',
  },
  {
    Icon: Telescope,
    title: 'Diagnose before prescribing',
    bodyLead: 'Teams that ',
    bodyMark: 'ask better questions',
    bodyTrail: ' before reaching for answers.',
  },
]

const PRACTICE_AREAS = ['Revenue', 'Operations', 'Product', 'Leadership']

export function SectionOutcomes() {
  return (
    <section id="outcomes" className="py-16 px-6 md:px-12">
      <div className="max-w-[1100px] mx-auto">
        <p className="font-mono text-[13.2px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)] mb-6 flex items-center gap-4">
          <span>The outcomes I&apos;m built to deliver</span>
          <span
            aria-hidden
            className="flex-1 h-px bg-[color:var(--color-border)] max-w-[160px]"
          />
        </p>

        <h2 className="font-display text-[clamp(30px,4vw,52px)] font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-14 text-balance max-w-[22ch]">
          Fewer fires. Clearer priorities.{' '}
          <em className="italic font-normal text-accent">Progress you can see.</em>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
          {OUTCOMES.map(({ Icon, title, bodyLead, bodyMark, bodyTrail }) => (
            <article key={title} className="grid grid-rows-[auto_auto_auto] gap-4 pt-1">
              <Icon
                size={60}
                strokeWidth={1.4}
                aria-hidden
                className="text-[color:var(--color-text-primary)] mb-2"
              />
              <h3 className="font-body text-xl font-semibold leading-snug tracking-[-0.01em] text-[color:var(--color-text-primary)] m-0">
                {title}
              </h3>
              <p className="font-body text-[16px] leading-[1.55] text-[color:var(--color-text-muted)] m-0 text-pretty max-w-[32ch]">
                {bodyLead}
                <span className="mark-highlight">
                  {bodyMark}
                </span>
                {bodyTrail}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-[72px] pt-8 border-t border-[color:var(--color-border)] grid grid-cols-1 lg:grid-cols-[1fr_auto] items-end gap-7 lg:gap-12">
          <p className="font-display italic font-normal text-[clamp(18px,1.8vw,22px)] leading-[1.55] text-[color:var(--color-text-muted)] m-0 max-w-[64ch] text-pretty">
            Underneath all of it: relationships always win.{' '}
            <span className="mark-highlight--display font-display">
              Know your customer, understand their pains, help them win.
            </span>{' '}
            That&apos;s the cornerstone of a durable business.
          </p>
          <div
            className="flex flex-wrap gap-2 lg:justify-end"
            aria-label="Practice areas"
          >
            {PRACTICE_AREAS.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] uppercase text-[color:var(--color-text-primary)] bg-surface border border-[color:var(--color-border)] rounded-full px-3 pt-2 pb-[7px]"
              >
                <span aria-hidden className="w-[7px] h-[7px] rounded-full bg-accent" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
