import {
  Globe as GlobeIcon,
  Search as SearchIcon,
  CalendarSync as CalendarSyncIcon,
  MessageSquare as MessageSquareIcon,
  Dumbbell as DumbbellIcon,
  Network as NetworkIcon,
} from 'lucide-react'

const CARDS = [
  {
    Icon: GlobeIcon,
    label: 'Range',
    body:
      'From $40/month SaaS to $10M enterprise. Vertical markets to broad. I’ve been in it at every scale.',
  },
  {
    Icon: SearchIcon,
    label: 'Pattern recognition',
    body:
      'I find what’s actually limiting performance — not the symptom everyone’s pointing at.',
  },
  {
    Icon: CalendarSyncIcon,
    label: 'Player-coach',
    body:
      'In the boardroom and on the floor. I go where the work is.',
  },
  {
    Icon: MessageSquareIcon,
    label: 'Straight shooter',
    body:
      'You’ll always know where things stand. No spin, no surprises.',
  },
  {
    Icon: DumbbellIcon,
    label: 'High challenge, high support',
    body:
      'I care enough to push the work — and the people doing it — to get better.',
  },
  {
    Icon: NetworkIcon,
    label: 'Team autonomy',
    body:
      'Strong teams don’t rely on heroics. I help build clarity, ownership, and momentum that lasts.',
  },
]

export function About() {
  return (
    <section id="about" className="py-16 px-6 md:px-12">
      <div className="max-w-6xl mx-auto">
        <p className="font-display italic text-lg md:text-xl leading-relaxed border-l-2 border-accent pl-4 text-[color:var(--color-text-muted)] mb-10 max-w-2xl">
          The people I&apos;ve led go on to outperform me. That&apos;s the goal.
        </p>

        <h2 className="font-display text-4xl md:text-5xl font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-10">
          My Approach.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-8">
          {CARDS.map(({ Icon, label, body }) => (
            <div
              key={label}
              className="bg-surface rounded-xl border border-[color:var(--color-border)] p-7"
            >
              <Icon className="text-accent mb-5" size={64} strokeWidth={1.75} />
              <p className="font-body text-xl font-semibold leading-snug text-[color:var(--color-text-primary)] mb-3">
                {label}
              </p>
              <p className="font-body text-base leading-relaxed text-[color:var(--color-text-muted)]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
