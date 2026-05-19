type Step = {
  title: string
  body: string
}

type TrustSignal = {
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    title: 'Book a working session',
    body:
      '$250, paid upfront. 60 minutes. No discovery call required — we get to work immediately.',
  },
  {
    title: 'We find the real problem',
    body:
      'Not the one on the surface. The one underneath it. Every session is a structured diagnostic, not a conversation that goes wherever it goes.',
  },
  {
    title: 'You leave with something',
    body:
      'A clear next step, a decision made, or a plan worth executing. What happens after depends on what we find — and that’s exactly how it should be.',
  },
]

const TRUST: TrustSignal[] = [
  {
    title: 'Transcript included.',
    body:
      'Every session is recorded and transcribed so nothing gets lost.',
  },
  {
    title: '100% satisfaction guarantee.',
    body:
      'If you don’t find value in the session, I’ll refund you. No questions asked.',
  },
]

export function Process() {
  return (
    <section id="process" className="py-16 px-6 md:px-12">
      <div className="max-w-4xl mx-auto">
        <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)] mb-6">
          How it works
        </p>

        <h2 className="font-display text-4xl md:text-5xl font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-12">
          One session. Real clarity.
        </h2>

        <ol className="space-y-12">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="grid grid-cols-[auto_1fr] gap-5 md:gap-8"
            >
              <span className="font-display text-3xl md:text-4xl leading-none text-[color:var(--color-text-dim)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-body text-lg font-semibold leading-snug text-[color:var(--color-text-primary)] mb-3">
                  {step.title}
                </h3>
                <p className="font-body text-base leading-relaxed text-[color:var(--color-text-muted)]">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-16 pt-10 border-t border-[color:var(--color-border)] space-y-4">
          {TRUST.map((t) => (
            <p
              key={t.title}
              className="font-mono text-[11px] leading-relaxed text-[color:var(--color-text-dim)]"
            >
              <span className="text-[color:var(--color-text-muted)]">
                {t.title}
              </span>{' '}
              {t.body}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}
