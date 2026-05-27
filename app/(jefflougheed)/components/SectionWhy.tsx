'use client'

import { useState } from 'react'
import {
  Globe,
  Handshake,
  ScanSearch,
  ArrowRight,
  Zap,
  BadgeCheck,
} from 'lucide-react'

type Reason = {
  Icon: typeof Globe
  title: string
  bodyLead: string
  bodyMark: string
  bodyTrail: string
}

const REASONS: Reason[] = [
  {
    Icon: Globe,
    title: 'Intentional Range',
    bodyLead: "The fundamentals that drive performance don't change, ",
    bodyMark: 'how you apply them does',
    bodyTrail: '.',
  },
  {
    Icon: Handshake,
    title: 'Give trust, get trust',
    bodyLead: 'Trusted people ',
    bodyMark: 'take ownership',
    bodyTrail: ', improve faster, and help teams scale.',
  },
  {
    Icon: ScanSearch,
    title: 'Signal over noise',
    bodyLead: 'Cut through the noise. Find the few things ',
    bodyMark: 'actually shaping performance',
    bodyTrail: ' and fix those.',
  },
  {
    Icon: ArrowRight,
    title: 'Progress over process',
    bodyLead: 'Processes should support the work, ',
    bodyMark: 'not become the work',
    bodyTrail: '.',
  },
  {
    Icon: Zap,
    title: 'Player-coach',
    bodyLead: 'Strategy matters, but ',
    bodyMark: 'credibility comes from contribution',
    bodyTrail: '.',
  },
  {
    Icon: BadgeCheck,
    title: "I'm honest about fit",
    bodyLead: 'Clear about where I can help most — and ',
    bodyMark: "where I can't",
    bodyTrail: '.',
  },
]

const PRACTICE_AREAS = ['Authentic', 'Collaborative', 'Inspiring']

const ANCHORS = [
  {
    heading: 'Diagnose',
    body: 'I look deeper. The real issue, not the presenting one.',
  },
  {
    heading: 'Develop',
    body: 'The people around me get better. Every time, without exception.',
  },
  {
    heading: 'Direct',
    body: "I tell the truth. Especially when it's the conversation nobody wants.",
  },
]

export function SectionWhy() {
  const [revealed, setRevealed] = useState(false)

  return (
    <section id="why" className="py-16 px-4 md:px-8">
      <div className="max-w-[1100px] mx-auto">
        <p className="font-mono text-[13.2px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)] mb-6 flex items-center gap-4">
          <span>I show up, listen, and contribute.</span>
          <span
            aria-hidden
            className="flex-1 h-px bg-[color:var(--color-border)] max-w-[160px]"
          />
        </p>

        <h2 className="font-display text-[clamp(30px,4vw,52px)] font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-14 text-balance">
          How I work
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-10">
          {ANCHORS.map(({ heading, body }) => (
            <div key={heading} className="flex flex-col gap-3">
              <h3 className="font-display text-[clamp(26px,3vw,36px)] font-normal leading-[1.1] tracking-[-0.01em] text-[color:var(--color-text-primary)] m-0">
                {heading}
              </h3>
              <p className="font-body text-[16px] leading-[1.55] text-[color:var(--color-text-muted)] m-0 text-pretty max-w-[34ch]">
                {body}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-expanded={revealed}
          aria-controls="why-detail"
          className="mt-12 inline-flex items-center font-mono text-[13px] tracking-[0.16em] uppercase text-accent hover:text-[color:var(--color-accent-hover)] bg-transparent border-0 p-0 cursor-pointer"
        >
          In practice
        </button>

        {revealed && (
          <div id="why-detail" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14 mt-12">
          {REASONS.map(({ Icon, title, bodyLead, bodyMark, bodyTrail }) => (
            <article key={title} className="grid grid-rows-[auto_auto_auto] gap-4 pt-1">
              <Icon
                size={60}
                strokeWidth={1.2}
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
        )}

        <div className="mt-[72px] pt-8 border-t border-[color:var(--color-border)] grid grid-cols-1 lg:grid-cols-[1fr_auto] items-end gap-7 lg:gap-12">
          <p className="font-display italic font-normal text-[clamp(18px,1.8vw,22px)] leading-[1.55] text-[color:var(--color-text-muted)] m-0 max-w-[64ch] text-pretty">
            Most of my career has been spent{' '}
            <span className="mark-highlight--display font-display">
              close to ownership
            </span>
            . It shapes how I lead, build, and make decisions.
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
