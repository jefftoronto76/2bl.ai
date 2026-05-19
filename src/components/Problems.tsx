import {
  TrendingDown as TrendingDownIcon,
  PowerOff as PowerOffIcon,
  Users as UsersIcon,
  PackageX as PackageXIcon,
  MessageCircleQuestion as MessageCircleQuestionIcon,
  Receipt as ReceiptIcon,
} from 'lucide-react'

const CARDS = [
  { Icon: TrendingDownIcon, label: 'Pipeline not converting' },
  { Icon: PowerOffIcon, label: 'Deals being lost' },
  { Icon: UsersIcon, label: 'Teams not gaining momentum' },
  { Icon: PackageXIcon, label: 'Systems sold, but not delivered' },
  { Icon: MessageCircleQuestionIcon, label: 'Mystery churn' },
  { Icon: ReceiptIcon, label: 'Clients not paying' },
]

const CREDENTIALS = ['Revenue', 'Operations', 'Product', 'Leadership']

export function Problems() {
  return (
    <section id="problems" className="py-16 px-6 md:px-12">
      <div className="max-w-6xl mx-auto">
        <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)] mb-6">
          Root cause, not blame
        </p>

        <h2 className="font-display text-4xl md:text-5xl font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-10">
          The problems I&apos;m built to solve.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-8">
          {CARDS.map(({ Icon, label }) => (
            <div
              key={label}
              className="bg-surface rounded-xl border border-[color:var(--color-border)] p-7"
            >
              <Icon className="text-[color:var(--color-text-primary)] mb-5" size={64} strokeWidth={1.75} />
              <p className="font-body text-xl font-semibold leading-snug text-[color:var(--color-text-primary)]">
                {label}
              </p>
            </div>
          ))}
        </div>

        <p className="font-display italic text-lg md:text-xl leading-relaxed text-[color:var(--color-text-muted)] mt-12 max-w-3xl">
          Underneath all of it: relationships always win. Know your customer,
          understand their pains, help them win. That&apos;s the cornerstone of
          a durable business.
        </p>

        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[color:var(--color-text-dim)] mt-8">
          {CREDENTIALS.map((c, i) => (
            <span key={c}>
              {c}
              {i < CREDENTIALS.length - 1 && (
                <span aria-hidden className="mx-2">
                  ·
                </span>
              )}
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}
