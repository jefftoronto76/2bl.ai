'use client'

/**
 * SectionProcess
 * ──────────────
 * "How it works" — two-track engagement flow.
 *
 * IA:
 *   1. Eyebrow + headline
 *   2. Per-track 2-line subhead (swaps with the active chip)
 *   3. Two chips: Coaching · Operator
 *   4. "Sound like you?" disclosure → reveals 7 symptom pills + a
 *      "click on a topic to explore with Sage" prompt; pills are
 *      conversation starters that link to the chat surface
 *   5. Three numbered step cards (Book → Work → Outcome); step 1 has
 *      the price-forward "Book a Session — C$250" CTA
 *   6. Deliverables tray pinned below the step grid (desktop) or
 *      inlined into the step stack after the yielding step (mobile),
 *      with a notch that slides between step columns on desktop
 *
 * Animations:
 *   - Step + deliverable cards: fade-up entry, keyed by active track
 *   - "Sound like you?" reveal: max-height + opacity transition
 *   - Pills: staggered fade-up on reveal open
 *   - Desktop notch: animated `left` between column centers
 *   - Mobile tray: height + opacity slide-in
 *
 * Wiring:
 *   - `ctaUrl`  → the "Book a Session — C$250" button
 *   - `chatUrl` → fallback href for the symptom pills
 *   - `onSymptomClick` → intercepts symptom pill clicks; receive
 *      `(symptom, trackId)` so the parent can pre-populate chat
 */

import { useEffect, useRef, useState } from 'react'
import {
  ShieldCheck,
  FileText,
  Files,
  ArrowRight,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'

/* ─── Wiring defaults ───────────────────────────────────────────────── */

/** Default href for the "Book a Session — C$250" CTA. Overridable via
 *  the `ctaUrl` prop so it can be set per-page or fed from config. */
const CTA_URL = ''

/** Default href for the symptom pills. The pills act as conversation
 *  starters with Sage — points at the chat anchor by default. */
const CHAT_URL = '#chat'

/* ─── Types ─────────────────────────────────────────────────────────── */

type TrackId = 'coaching' | 'operator'

type Step = { title: string; body: string }

type DeliverableIconKind = 'shield' | 'transcript' | 'docs'

type Deliverable = {
  icon: DeliverableIconKind
  title: string
  body: string
}

type Track = {
  id: TrackId
  chipLabel: string
  /** Two paragraph lines that replace the lede under the headline. */
  subhead: [string, string]
  symptoms: string[]
  steps: [Step, Step, Step]
  deliverables: {
    /** 0-indexed step the deliverables "come from" — controls the
     *  origin-card accent and the desktop tray's notch position. */
    originStep: 0 | 1 | 2
    items: [Deliverable, Deliverable, Deliverable]
  }
}

/* ─── Data ──────────────────────────────────────────────────────────── */

const TRACKS: Record<TrackId, Track> = {
  coaching: {
    id: 'coaching',
    chipLabel: 'Coaching',
    subhead: [
      'Structured thinking work, not just conversations.',
      'A clear process to get you unstuck and moving forward.',
    ],
    symptoms: [
      'A deal you can’t afford to lose',
      'Conversations you don’t know how to have',
      'Teams that aren’t working together',
      'Decisions with no clear answer',
      'A project that’s going sideways',
      'Pipeline that doesn’t convert',
      'Customers quietly churning',
    ],
    steps: [
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
    deliverables: {
      originStep: 1,
      items: [
        {
          icon: 'shield',
          title: 'Coaching plan',
          // TODO(copy): confirm coaching-deliverable bodies.
          body: 'A defined path forward you can act on this week.',
        },
        {
          icon: 'transcript',
          title: 'Session recordings',
          body: 'Full audio + transcript, indexed for re-listening.',
        },
        {
          icon: 'docs',
          title: 'Weekly check-ins',
          body: '7 days of async back-and-forth on what you took away.',
        },
      ],
    },
  },
  operator: {
    id: 'operator',
    chipLabel: 'Operator',
    subhead: [
      'For organizations that want to grow without the drama.',
      'I build systems that stop problems from happening.',
    ],
    symptoms: [
      'Forecasts you don’t trust',
      'Conversion drops nobody can explain',
      'Systems breaking under growth',
      'A critical project off track',
      'A leadership gap slowing execution',
      'Friction between product, sales, and customers',
      'AI plans that aren’t operational',
    ],
    steps: [
      // TODO(copy): operator-track step copy was carried over from the
      // earlier "consulting" tier. Confirm with Jeff this still reads
      // right for the embedded-execution audience.
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
    deliverables: {
      originStep: 1,
      items: [
        {
          icon: 'shield',
          title: 'Diagnostic memo',
          body: 'The real constraint, named. Plus the one thing to fix first.',
        },
        {
          icon: 'transcript',
          title: 'Working session(s)',
          body: 'Recurring cadence with operator-level accountability.',
        },
        {
          icon: 'docs',
          title: 'Implementation plan',
          body: 'Scope, deliverables, owner, and a defined exit.',
        },
      ],
    },
  },
}

const TRACK_ORDER: TrackId[] = ['coaching', 'operator']

const DELIVERABLE_ICON: Record<DeliverableIconKind, LucideIcon> = {
  shield: ShieldCheck,
  transcript: FileText,
  docs: Files,
}

/* ─── Static class lookups ──────────────────────────────────────────── */

/** Notch column-center positions for a 3-column grid. Hardcoded so
 *  Tailwind sees the class strings at build time. */
const NOTCH_LEFT_BY_STEP = [
  'left-[16.667%]',
  'left-[50%]',
  'left-[83.333%]',
] as const

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

const PILL_DELAY = [
  '[animation-delay:0ms]',
  '[animation-delay:35ms]',
  '[animation-delay:70ms]',
  '[animation-delay:105ms]',
  '[animation-delay:140ms]',
  '[animation-delay:175ms]',
  '[animation-delay:210ms]',
] as const

/* ─── Subcomponents ─────────────────────────────────────────────────── */

function TrackChips({
  active,
  setActive,
}: {
  active: TrackId
  setActive: (id: TrackId) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Engagement track"
      className="flex flex-wrap gap-2.5"
    >
      {TRACK_ORDER.map((id) => {
        const on = active === id
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => setActive(id)}
            className={[
              'inline-flex items-center gap-2 rounded-full border px-4 py-[9px]',
              'font-body text-[13px] font-medium tracking-[0.01em] cursor-pointer',
              'transition-colors duration-150',
              on
                ? 'bg-[color:var(--color-text-primary)] border-[color:var(--color-text-primary)] text-bg'
                : 'bg-surface border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-hover)] hover:text-[color:var(--color-text-primary)]',
            ].join(' ')}
          >
            {TRACKS[id].chipLabel}
          </button>
        )
      })}
    </div>
  )
}

function Subhead({ track }: { track: Track }) {
  return (
    <div
      key={'subhead-' + track.id}
      className="mb-9 max-w-[64ch] [animation:hiwFadeUp_0.32s_ease_both]"
    >
      {track.subhead.map((line, i) => (
        <p
          key={i}
          className={[
            'font-body text-[17px] leading-[1.7] text-[color:var(--color-text-muted)] max-w-[56ch]',
            i === 0 ? 'mb-2' : '',
          ].join(' ')}
        >
          {line}
        </p>
      ))}
    </div>
  )
}

function SymptomReveal({
  track,
  chatUrl,
  onSymptomClick,
}: {
  track: Track
  chatUrl: string
  onSymptomClick?: (symptom: string, trackId: TrackId) => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = 'sp-symptom-panel'

  return (
    <div className="mt-[18px] mb-8">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2.5 bg-transparent border-0 p-0 py-1.5 cursor-pointer font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-primary)] hover:text-accent transition-colors"
      >
        <span>Sound like you?</span>
        <ChevronDown
          aria-hidden
          size={11}
          strokeWidth={2.2}
          className={[
            'text-accent transition-transform duration-300 ease-[cubic-bezier(0.65,0,0.35,1)]',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {/* Reveal panel — max-height + opacity transition. max-height is
          generous (800px) because the pill cluster can wrap on narrow
          viewports. Don't use display:grid grid-template-rows for the
          transition here — it doesn't reliably resolve to content
          height without a parent height context. */}
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className={[
          'overflow-hidden',
          'transition-[max-height,opacity,margin-top] duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)]',
          open ? 'max-h-[800px] opacity-100 mt-3.5' : 'max-h-0 opacity-0 mt-0',
        ].join(' ')}
      >
        <p className="mb-3.5 font-mono text-[11px] tracking-[0.16em] uppercase text-[color:var(--color-text-dim)]">
          Click on a topic to explore with Sage
        </p>

        <div className="flex flex-wrap gap-2">
          {track.symptoms.map((s, i) => (
            <a
              key={i}
              href={chatUrl}
              onClick={
                onSymptomClick
                  ? (e) => {
                      e.preventDefault()
                      onSymptomClick(s, track.id)
                    }
                  : undefined
              }
              className={[
                'group inline-flex items-center gap-2 rounded-full',
                'bg-surface border border-[color:var(--color-border)]',
                'px-3.5 py-2 font-body text-[13px] text-[color:var(--color-text-primary)] no-underline',
                'transition-[border-color,background-color] duration-150 cursor-pointer',
                'hover:border-accent/55 hover:bg-accent/[0.06]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                open ? '[animation:hiwFadeUp_0.32s_ease_both]' : '',
                PILL_DELAY[i] ?? PILL_DELAY[0],
              ].join(' ')}
            >
              <span>{s}</span>
              <ArrowRight
                aria-hidden
                size={12}
                strokeWidth={2}
                className="text-accent transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </a>
          ))}
        </div>
      </div>
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
      Book a Session &mdash; C$250
      <ArrowRight aria-hidden size={14} strokeWidth={2} />
    </a>
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
  filterKey: TrackId
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

function DeliverableTile({ d, delay }: { d: Deliverable; delay: string }) {
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

function DesktopTray({ track }: { track: Track }) {
  const { originStep, items } = track.deliverables
  const notchLeft = NOTCH_LEFT_BY_STEP[originStep]
  const fromLabel = `From step ${String(originStep + 1).padStart(2, '0')}`

  return (
    <div className="relative rounded-[20px] border border-accent/[0.16] bg-accent/[0.045] px-6 pt-8 pb-7">
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
          key={track.id + '-from'}
          className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-surface px-2 py-1 font-mono text-[10.5px] tracking-[0.18em] uppercase text-[color:var(--color-text-dim)] [animation:hiwPop_0.4s_ease_both]"
        >
          {fromLabel}
        </span>
        <span aria-hidden className="h-px flex-1 bg-accent/[0.16]" />
      </div>

      <div key={track.id + '-d'} className="grid grid-cols-3 gap-6">
        {items.map((d, i) => (
          <DeliverableTile
            key={track.id + 'd' + i}
            d={d}
            delay={DELIV_DELAY[i] ?? DELIV_DELAY[0]}
          />
        ))}
      </div>
    </div>
  )
}

function MobileTray({ track }: { track: Track }) {
  const { items } = track.deliverables
  return (
    <div
      key={track.id + '-mtray'}
      className="rounded-[14px] border border-accent/25 bg-accent/[0.045] px-[18px] py-5 overflow-hidden [animation:hiwMobileTrayIn_0.45s_cubic-bezier(0.65,0,0.35,1)_both]"
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <p className="m-0 font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
          What&rsquo;s included
        </p>
        <span aria-hidden className="h-px flex-1 bg-accent/[0.18]" />
      </div>

      <div className="flex flex-col gap-3">
        {items.map((d, i) => {
          const Icon = DELIVERABLE_ICON[d.icon]
          return (
            <div
              key={track.id + 'md' + i}
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

      @media (prefers-reduced-motion: reduce) {
        [class*="[animation:hiw"] { animation: none !important }
        [class*="transition-[left"] { transition: none !important }
      }
    `}</style>
  )
}

/* ─── Main export ───────────────────────────────────────────────────── */

export type SectionProcessProps = {
  /** Override the module-level CTA_URL default ("Book a Session — C$250"). */
  ctaUrl?: string
  /** Default href the symptom pills navigate to when no
   *  `onSymptomClick` handler is provided. */
  chatUrl?: string
  /** Intercept symptom-pill clicks. Receives the symptom text and the
   *  active track id so the parent can pre-populate the chat composer. */
  onSymptomClick?: (symptom: string, trackId: TrackId) => void
  /** Starting track. Defaults to 'coaching'. */
  defaultTrack?: TrackId
}

export function SectionProcess({
  ctaUrl = CTA_URL,
  chatUrl = CHAT_URL,
  onSymptomClick,
  defaultTrack = 'coaching',
}: SectionProcessProps = {}) {
  const [activeId, setActiveId] = useState<TrackId>(defaultTrack)
  const track = TRACKS[activeId]

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

        {/* Headline */}
        <h2
          id="how-it-works-h"
          className="mb-4 font-display font-normal text-[clamp(34px,4.2vw,56px)] leading-[1.06] tracking-[-0.02em] text-[color:var(--color-text-primary)] text-pretty"
        >
          It starts with
          <br />
          <em className="font-display italic text-accent">one conversation.</em>
        </h2>

        {/* Per-track subhead */}
        <Subhead track={track} />

        {/* Chips */}
        <TrackChips active={activeId} setActive={setActiveId} />

        {/* "Sound like you?" reveal */}
        {/* TODO(sage): wire onSymptomClick to chat store to pre-populate the composer. */}
        <SymptomReveal
          track={track}
          chatUrl={chatUrl}
          onSymptomClick={onSymptomClick}
        />

        {/* Step cards — 3 cols on desktop, stacked on mobile. Mobile
            tray slots inline after the originStep card; desktop tray
            renders separately below. */}
        <div className="mb-10 grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-6">
          {track.steps.map((s, i) => {
            const isOrigin = track.deliverables.originStep === i
            return (
              <div key={activeId + 'cell' + i} className="contents lg:contents">
                <StepCard
                  step={s}
                  index={i}
                  isOrigin={isOrigin}
                  filterKey={activeId}
                  ctaUrl={ctaUrl}
                />
                {i === track.deliverables.originStep && (
                  <div className="lg:hidden">
                    <MobileTray track={track} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Desktop tray with sliding notch (hidden on mobile). */}
        <div className="hidden lg:block">
          <DesktopTray track={track} />
        </div>
      </div>

      <SectionKeyframes />
    </section>
  )
}

export default SectionProcess
