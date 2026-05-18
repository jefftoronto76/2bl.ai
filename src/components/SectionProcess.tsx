'use client'

/**
 * SectionProcess
 * ──────────────
 * "How it works" — filterable 3-step flow + deliverables tray.
 *
 * Engagement filter chips swap the 3 step cards. The deliverables tray
 * sits below the step grid on ≥lg with an animated notch pointing at the
 * step that yields the deliverables; on <lg the tray instead slots
 * inline into the step stack right after that step. The tray's `tbd`
 * branch renders a "coming soon" card (used by the `operator` filter).
 *
 * Animations:
 *   - filter-change crossfade on step + deliverable cards (keyed remount)
 *   - desktop notch slides between columns via CSS transition
 *   - mobile tray slides in (height + opacity)
 *   - testimonial card fades on rotation
 *
 * See companion handover notes for: globals.css palette patch for
 * `#how-it-works`, copy TODOs, and testimonial wiring.
 */

import { useEffect, useState } from 'react'
import {
  ShieldCheck,
  FileText,
  Files,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'

/* ─── Wiring ────────────────────────────────────────────────────────── */

/** Default href for the "Book a session" CTA. Overridable via the
 *  `ctaUrl` prop so it can be set per-page or fed from config. */
const CTA_URL = ''

/* ─── Types & data ──────────────────────────────────────────────────── */

type FilterId = 'all' | 'coaching' | 'consulting' | 'operator'

type Filter = { id: FilterId; label: string }

const FILTERS: Filter[] = [
  { id: 'all', label: 'All' },
  { id: 'coaching', label: 'Coaching' },
  { id: 'consulting', label: 'Consulting' },
  { id: 'operator', label: 'Operator' },
]

type Step = { title: string; body: string }

const STEPS: Record<FilterId, Step[]> = {
  all: [
    {
      title: 'Book a session',
      body:
        'Not sure where to start? Sage can help you figure out if this is right for you. When you’re ready — $250, no commitment beyond that.',
    },
    {
      title: 'The work',
      body:
        'A structured conversation with a proven framework behind it. Focused entirely on what you bring to it.',
    },
    {
      title: 'What you leave with',
      body:
        'Something concrete — defined by what we set out to do together.',
    },
  ],
  coaching: [
    {
      title: 'Book a session',
      body:
        'Talk to Sage if you need to think it through. When you’re ready, one session is all it takes to start.',
    },
    {
      title: 'The session',
      body:
        'ICF-certified coaching methodology. A conversation that goes beneath the surface — agenda-free, focused on what’s actually in the way.',
    },
    {
      title: 'The shift',
      body:
        'Clarity on what’s really going on. A defined next move that’s yours to own.',
    },
  ],
  consulting: [
    {
      title: 'Book a session',
      body:
        'Bring the problem. We’ll figure out the right scope together in the first conversation.',
    },
    {
      title: 'The work',
      body:
        'Fast, focused, and grounded in real pattern recognition. You get a thinking partner who’s been in the room before — and an opinion.',
    },
    {
      title: 'The document',
      body:
        'A playbook, a strategy, a recommendation. Something clear and actionable you can use immediately.',
    },
  ],
  operator: [
    {
      title: 'Book a session',
      body:
        'Bring the gap. We’ll define what needs to happen, how it gets done, and what success looks like.',
    },
    {
      title: 'The engagement',
      body:
        'Senior operator inside the work. Accountable for outcomes, not just advice. Tools, cadence, and delivery standards built in from the start.',
    },
    {
      title: 'The SOW',
      body:
        'A defined scope, clear deliverables, and full accountability. Then we get to work.',
    },
  ],
}

type DeliverableIconKind = 'shield' | 'transcript' | 'docs'

const DELIVERABLE_ICON: Record<DeliverableIconKind, LucideIcon> = {
  shield: ShieldCheck,
  transcript: FileText,
  docs: Files,
}

type Deliverable = { icon: DeliverableIconKind; title: string; body: string }

type DeliverablesGroup =
  | { tbd: false; originStep: 0 | 1 | 2; items: Deliverable[] }
  | { tbd: true; originStep: null; items: [] }

const DELIVERABLES: Record<FilterId, DeliverablesGroup> = {
  all: {
    tbd: false,
    originStep: 2,
    items: [
      {
        icon: 'shield',
        title: '100% money-back guarantee',
        // TODO(copy): replace placeholder body.
        body: 'Lorem ipsum dolor sit amet, consectetur adipiscing.',
      },
      {
        icon: 'transcript',
        title: 'Session transcript',
        // TODO(copy): replace placeholder body.
        body: 'Sed do eiusmod tempor incididunt ut labore et dolore.',
      },
      {
        icon: 'docs',
        title: 'Relevant docs & references',
        // TODO(copy): replace placeholder body.
        body: 'Ut enim ad minim veniam, quis nostrud exercitation.',
      },
    ],
  },
  coaching: {
    tbd: false,
    originStep: 1,
    items: [
      {
        icon: 'shield',
        title: 'Coaching plan',
        // TODO(copy): replace placeholder body.
        body: 'Excepteur sint occaecat cupidatat non proident.',
      },
      {
        icon: 'transcript',
        title: 'Session recordings',
        // TODO(copy): replace placeholder body.
        body: 'Sunt in culpa qui officia deserunt mollit anim.',
      },
      {
        icon: 'docs',
        title: 'Weekly check-ins',
        // TODO(copy): replace placeholder body.
        body: 'Sed ut perspiciatis unde omnis iste natus error.',
      },
    ],
  },
  consulting: {
    tbd: false,
    originStep: 1,
    items: [
      {
        icon: 'shield',
        title: 'Strategy memo',
        // TODO(copy): replace placeholder body.
        body: 'Nemo enim ipsam voluptatem quia voluptas sit.',
      },
      {
        icon: 'transcript',
        title: 'Working sessions',
        // TODO(copy): replace placeholder body.
        body: 'Aspernatur aut odit aut fugit, sed quia consequuntur.',
      },
      {
        icon: 'docs',
        title: 'Implementation plan',
        // TODO(copy): replace placeholder body.
        body: 'Neque porro quisquam est qui dolorem ipsum quia.',
      },
    ],
  },
  operator: { tbd: true, originStep: null, items: [] },
}

// TODO(testimonials): Wire to the same source backing SectionTestimonials.
// Lift the data array into a shared module (e.g. src/lib/testimonials.ts),
// import here, and slice 2–3 quotes for the rotation.
type Testimonial = { quote: string; name: string; role: string; initials: string }

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
    name: 'Lorem Ipsum',
    role: 'CEO · Placeholder Co.',
    initials: 'LI',
  },
  {
    quote:
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.',
    name: 'Dolor Sit',
    role: 'Founder · Sample Inc.',
    initials: 'DS',
  },
  {
    quote:
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    name: 'Amet Vel',
    role: 'COO · Example Co.',
    initials: 'AV',
  },
]

/* ─── Static class lookups ──────────────────────────────────────────── */

/** Notch sits over the column-center of step N (three equal columns).
 *  Hardcoded so Tailwind picks them up at build time. */
const NOTCH_LEFT_BY_STEP = [
  'left-[16.667%]',
  'left-[50%]',
  'left-[83.333%]',
] as const

/** Per-card stagger delays. Same approach — static so Tailwind keeps
 *  them. Indexed by step / deliverable position. */
const CARD_DELAY = [
  '[animation-delay:0ms]',
  '[animation-delay:50ms]',
  '[animation-delay:100ms]',
] as const

const DELIV_DELAY = [
  '[animation-delay:0ms]',
  '[animation-delay:70ms]',
  '[animation-delay:140ms]',
] as const

const MOBILE_DELIV_DELAY = [
  '[animation-delay:140ms]',
  '[animation-delay:200ms]',
  '[animation-delay:260ms]',
] as const

/* ─── Subcomponents ─────────────────────────────────────────────────── */

function FilterChips({
  active,
  setActive,
}: {
  active: FilterId
  setActive: (id: FilterId) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Engagement track"
      className="flex flex-wrap gap-2"
    >
      {FILTERS.map((f) => {
        const on = active === f.id
        return (
          <button
            key={f.id}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => setActive(f.id)}
            className={[
              'inline-flex items-center gap-2 rounded-full border px-4 py-[9px]',
              'font-body text-[13px] font-medium tracking-[0.01em] cursor-pointer',
              'transition-colors duration-150',
              on
                ? 'bg-[color:var(--color-text-primary)] border-[color:var(--color-text-primary)] text-bg'
                : 'bg-surface border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-hover)] hover:text-[color:var(--color-text-primary)]',
            ].join(' ')}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

function CTAButton({ href }: { href: string }) {
  const isLive = href.length > 0
  return (
    <a
      href={isLive ? href : '#'}
      aria-disabled={!isLive || undefined}
      tabIndex={isLive ? undefined : -1}
      onClick={isLive ? undefined : (e) => e.preventDefault()}
      className={[
        'mt-[18px] inline-flex items-center gap-2.5 rounded-full px-[18px] py-[11px]',
        'font-body text-[14px] font-semibold tracking-[0.01em] whitespace-nowrap',
        'bg-accent text-bg transition-colors duration-150',
        'hover:bg-[color:var(--color-accent-hover)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        !isLive && 'opacity-90 cursor-not-allowed',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Book a session
      <ArrowRight aria-hidden size={14} strokeWidth={2} />
    </a>
  )
}

function TestimonialCard() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % TESTIMONIALS.length),
      5000,
    )
    return () => window.clearInterval(id)
  }, [])

  const q = TESTIMONIALS[idx]

  return (
    <figure className="relative m-0 rounded-2xl bg-surface border border-[color:var(--color-border)] p-7 pt-7 pb-[22px] shadow-[0_4px_24px_rgba(24,32,41,0.04)]">
      <span
        aria-hidden
        className="pointer-events-none select-none absolute top-3.5 right-[22px] font-display italic text-[80px] leading-[0.8] text-accent/20"
      >
        ”
      </span>

      <blockquote
        key={idx}
        className="m-0 pr-9 mb-5 font-display italic font-normal text-[19px] leading-[1.5] text-[color:var(--color-text-primary)] [animation:hiwTestiFade_0.5s_ease_both]"
      >
        “{q.quote}”
      </blockquote>

      <figcaption className="flex items-center justify-between gap-3">
        <div
          key={'fig' + idx}
          className="flex items-center gap-3 [animation:hiwTestiFade_0.5s_ease_both]"
        >
          <span
            aria-hidden
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent/10 text-accent font-body text-xs font-semibold tracking-[0.04em]"
          >
            {q.initials}
          </span>
          <div className="min-w-0">
            <div className="font-body text-[14px] font-semibold leading-tight text-[color:var(--color-text-primary)]">
              {q.name}
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] tracking-[0.1em] uppercase text-[color:var(--color-text-dim)]">
              {q.role}
            </div>
          </div>
        </div>

        <div className="flex gap-1.5">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Show testimonial ${i + 1}`}
              className={[
                'h-1.5 cursor-pointer rounded-full border-0 p-0',
                'transition-[width,background-color] duration-300',
                i === idx
                  ? 'w-[18px] bg-accent'
                  : 'w-1.5 bg-[color:var(--color-text-primary)]/20',
              ].join(' ')}
            />
          ))}
        </div>
      </figcaption>
    </figure>
  )
}

function StepCard({
  step,
  index,
  isOrigin,
  filterKey,
  ctaUrl,
}: {
  step: Step
  index: number
  isOrigin: boolean
  filterKey: FilterId
  ctaUrl: string
}) {
  const Number = String(index + 1).padStart(2, '0')
  return (
    <article
      key={filterKey + 'step' + index}
      data-origin={isOrigin || undefined}
      className={[
        'relative flex min-h-[240px] flex-col gap-5 rounded-2xl bg-surface',
        'border p-7 lg:px-7 lg:py-8',
        'transition-[border-color,box-shadow] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]',
        '[animation:hiwFadeUp_0.32s_ease_both]',
        CARD_DELAY[index] ?? CARD_DELAY[0],
        isOrigin
          ? 'border-accent/60 shadow-[0_6px_28px_rgba(45,106,79,0.10)]'
          : 'border-[color:var(--color-border)] shadow-[0_4px_24px_rgba(24,32,41,0.04)]',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-display font-normal text-[40px] lg:text-[56px] leading-[0.9] tracking-[-0.02em] text-[color:var(--color-text-primary)]/30">
          {Number}
        </span>
        <span
          className={[
            'font-mono text-[10.5px] tracking-[0.18em] uppercase',
            'transition-colors duration-500',
            isOrigin ? 'text-accent' : 'text-[color:var(--color-text-dim)]',
          ].join(' ')}
        >
          {isOrigin ? '→ Yields' : 'Step'}
        </span>
      </div>

      <div>
        <h3 className="mb-2.5 font-body text-[18px] font-semibold leading-[1.35] text-[color:var(--color-text-primary)]">
          {step.title}
        </h3>
        <p className="font-body text-[15px] leading-[1.7] text-[color:var(--color-text-muted)]">
          {step.body}
        </p>
        {index === 0 && <CTAButton href={ctaUrl} />}
      </div>
    </article>
  )
}

function DeliverableTile({
  d,
  delay,
}: {
  d: Deliverable
  delay: string
}) {
  const Icon = DELIVERABLE_ICON[d.icon]
  return (
    <article
      className={[
        'grid grid-cols-[auto_1fr] items-start gap-4 rounded-[14px]',
        'bg-surface border border-[color:var(--color-border)]',
        'px-[22px] pt-[22px] pb-6',
        '[animation:hiwDelivIn_0.45s_ease_both]',
        delay,
      ].join(' ')}
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-accent/10 text-accent">
        <Icon size={20} strokeWidth={1.7} aria-hidden />
      </div>
      <div className="min-w-0">
        <h4 className="mb-1.5 font-body text-[15px] font-semibold leading-[1.3] text-[color:var(--color-text-primary)]">
          {d.title}
        </h4>
        <p className="font-body text-[13.5px] leading-[1.6] text-[color:var(--color-text-muted)]">
          {d.body}
        </p>
      </div>
    </article>
  )
}

/* Desktop tray (≥ lg). Sits below the step grid; notch slides between
 * step columns when filter changes. */
function DesktopTray({
  group,
  filterKey,
}: {
  group: DeliverablesGroup
  filterKey: FilterId
}) {
  if (group.tbd) {
    return (
      <div
        key={filterKey + '-tbd'}
        className="rounded-[20px] border border-dashed border-[color:var(--color-border-hover)] bg-surface px-7 py-11 text-center [animation:hiwFadeUp_0.4s_ease_both]"
      >
        <p className="mb-3.5 font-mono text-[10.5px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">
          Coming soon
        </p>
        <p className="mx-auto mb-2 max-w-[32ch] font-display text-2xl leading-[1.3] text-[color:var(--color-text-primary)]">
          {/* TODO(copy): operator-tier deliverables headline. */}
          Lorem ipsum —{' '}
          <em className="font-display italic text-accent">more complex</em>, to
          follow.
        </p>
        <p className="mx-auto max-w-[48ch] font-body text-[15px] leading-[1.7] text-[color:var(--color-text-muted)]">
          {/* TODO(copy): operator-tier deliverables body. */}
          Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </p>
      </div>
    )
  }

  const notchLeft = NOTCH_LEFT_BY_STEP[group.originStep]
  const fromLabel = `From step ${String(group.originStep + 1).padStart(2, '0')}`

  return (
    <div className="relative rounded-[20px] border border-accent/[0.16] bg-accent/[0.045] px-6 pt-8 pb-7">
      {/* Notch — diamond welded to the tray's top edge, sliding between
          step columns on filter change. */}
      <span
        aria-hidden
        className={[
          'absolute -top-[8px] block h-[14px] w-[14px] -translate-x-1/2 rotate-45',
          'border-l border-t border-accent/35 bg-accent/[0.045]',
          'transition-[left] duration-[550ms] ease-[cubic-bezier(0.65,0,0.35,1)]',
          notchLeft,
        ].join(' ')}
      />

      <div className="mb-[18px] flex items-center gap-3">
        <p className="m-0 font-mono text-[11px] tracking-[0.22em] uppercase text-accent">
          What you&rsquo;ll walk away with
        </p>
        <span
          key={filterKey + '-from'}
          className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-surface px-2 py-1 font-mono text-[10.5px] tracking-[0.18em] uppercase text-[color:var(--color-text-dim)] [animation:hiwPop_0.4s_ease_both]"
        >
          {fromLabel}
        </span>
        <span aria-hidden className="h-px flex-1 bg-accent/[0.16]" />
      </div>

      <div
        key={filterKey + '-d'}
        className="grid grid-cols-3 gap-6"
      >
        {group.items.map((d, i) => (
          <DeliverableTile
            key={filterKey + 'd' + i}
            d={d}
            delay={DELIV_DELAY[i] ?? DELIV_DELAY[0]}
          />
        ))}
      </div>
    </div>
  )
}

/* Mobile tray (< lg). Sits inline in the step stack right after the
 * step that yields it. */
function MobileTray({
  group,
  filterKey,
}: {
  group: DeliverablesGroup
  filterKey: FilterId
}) {
  if (group.tbd) {
    return (
      <div
        key={filterKey + '-mtbd'}
        className="rounded-[14px] border border-dashed border-accent/35 bg-accent/[0.045] p-[22px] overflow-hidden [animation:hiwMobileTrayIn_0.45s_cubic-bezier(0.65,0,0.35,1)_both]"
      >
        <p className="mb-2 font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
          Coming soon
        </p>
        <p className="mb-1.5 font-display text-[19px] leading-[1.3] text-[color:var(--color-text-primary)]">
          {/* TODO(copy): operator-tier deliverables headline (mobile). */}
          Lorem ipsum —{' '}
          <em className="font-display italic text-accent">more complex</em>, to
          follow.
        </p>
        <p className="font-body text-[13.5px] leading-[1.55] text-[color:var(--color-text-muted)]">
          {/* TODO(copy): operator-tier deliverables body (mobile). */}
          Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </p>
      </div>
    )
  }

  return (
    <div
      key={filterKey + '-mtray'}
      className="rounded-[14px] border border-accent/25 bg-accent/[0.045] px-[18px] pt-5 pb-5 overflow-hidden [animation:hiwMobileTrayIn_0.45s_cubic-bezier(0.65,0,0.35,1)_both]"
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <p className="m-0 font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
          What&rsquo;s included
        </p>
        <span aria-hidden className="h-px flex-1 bg-accent/[0.18]" />
      </div>

      <div className="flex flex-col gap-3">
        {group.items.map((d, i) => {
          const Icon = DELIVERABLE_ICON[d.icon]
          return (
            <div
              key={filterKey + 'md' + i}
              className={[
                'grid grid-cols-[auto_1fr] items-start gap-3',
                '[animation:hiwMobileTrayItem_0.45s_ease_both]',
                MOBILE_DELIV_DELAY[i] ?? MOBILE_DELIV_DELAY[0],
              ].join(' ')}
            >
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-accent/20 bg-surface text-accent">
                <Icon size={16} strokeWidth={1.7} aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="mb-0.5 font-body text-[13.5px] font-semibold leading-[1.3] text-[color:var(--color-text-primary)]">
                  {d.title}
                </div>
                <p className="font-body text-[12.5px] leading-[1.55] text-[color:var(--color-text-muted)]">
                  {d.body}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Section keyframes ─────────────────────────────────────────────── */

/* Defined inline so this component is genuinely drop-in. See handover
 * notes for moving these to app/globals.css if preferred. */
function SectionKeyframes() {
  return (
    <style>{`
      @keyframes hiwFadeUp {
        from { opacity: 0; transform: translateY(6px) }
        to   { opacity: 1; transform: none }
      }
      @keyframes hiwDelivIn {
        from { opacity: 0; transform: translateY(10px) }
        to   { opacity: 1; transform: none }
      }
      @keyframes hiwPop {
        from { opacity: 0; transform: scale(0.92) }
        to   { opacity: 1; transform: none }
      }
      @keyframes hiwMobileTrayIn {
        from { opacity: 0; transform: translateY(-4px); max-height: 0; padding-top: 0; padding-bottom: 0; margin-top: -12px; }
        50%  { opacity: 0.6; max-height: 600px; }
        to   { opacity: 1; transform: none; max-height: 600px; }
      }
      @keyframes hiwMobileTrayItem {
        from { opacity: 0; transform: translateY(4px) }
        to   { opacity: 1; transform: none }
      }
      @keyframes hiwTestiFade {
        from { opacity: 0; transform: translateY(4px) }
        to   { opacity: 1; transform: none }
      }

      @media (prefers-reduced-motion: reduce) {
        [class*="[animation:hiw"] { animation: none !important }
        [class*="transition-[left"] { transition: none !important }
      }
    `}</style>
  )
}

/* ─── Main export ───────────────────────────────────────────────────── */

export type SectionProcessProps = {
  /** Override the module-level CTA_URL default. */
  ctaUrl?: string
}

export function SectionProcess({ ctaUrl = CTA_URL }: SectionProcessProps = {}) {
  const [active, setActive] = useState<FilterId>('all')
  const steps = STEPS[active]
  const deliv = DELIVERABLES[active]

  // Mobile tray slots in AFTER the step at originStep. tbd case falls
  // through to after the last step.
  const traySlot = deliv.tbd ? steps.length - 1 : deliv.originStep

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-h"
      className="py-20 px-6 md:px-12"
    >
      <div className="mx-auto max-w-[1100px]">
        {/* Eyebrow */}
        <p className="mb-7 flex items-center gap-4 font-mono text-[13.2px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">
          <span className="hilite">How it works</span>
          <span
            aria-hidden
            className="block h-px max-w-[120px] flex-1 bg-[color:var(--color-border)]"
          />
        </p>

        {/* Headline + testimonial (desktop split, headline-only on mobile) */}
        <div className="mb-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <h2
            id="how-it-works-h"
            className="font-display font-normal text-[clamp(34px,4.2vw,56px)] leading-[1.06] tracking-[-0.02em] text-[color:var(--color-text-primary)] text-pretty"
          >
            It starts with
            <br />
            <em className="font-display italic text-accent">one conversation.</em>
          </h2>
          <div className="hidden lg:block">
            <TestimonialCard />
          </div>
        </div>

        {/* Filter chips */}
        <div className="mb-10">
          <FilterChips active={active} setActive={setActive} />
        </div>

        {/* Step cards — 3 cols on desktop, stacked on mobile.
            Mobile tray slots inline after `traySlot`; desktop tray
            renders separately below. */}
        <div className="mb-10 grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-6">
          {steps.map((s, i) => {
            const isOrigin = !deliv.tbd && deliv.originStep === i
            return (
              <div key={active + 'cell' + i} className="contents lg:contents">
                <StepCard
                  step={s}
                  index={i}
                  isOrigin={isOrigin}
                  filterKey={active}
                  ctaUrl={ctaUrl}
                />
                {i === traySlot && (
                  <div className="lg:hidden">
                    <MobileTray group={deliv} filterKey={active} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Desktop tray with sliding notch (hidden on mobile). */}
        <div className="hidden lg:block">
          <DesktopTray group={deliv} filterKey={active} />
        </div>
      </div>

      <SectionKeyframes />
    </section>
  )
}

export default SectionProcess
