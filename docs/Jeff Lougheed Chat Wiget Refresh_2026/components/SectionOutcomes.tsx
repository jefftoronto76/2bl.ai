'use client'

/**
 * SectionOutcomes — "Outcomes I focus on"
 * ────────────────────────────────────────
 * Mode-aware editorial section. An Operator/Coach toggle (shared via
 * useMode, so it moves in lock-step with SectionWhy and SectionProcess)
 * re-skins the block into fewer, larger outcome statements per mode.
 *
 * Coda:
 *   - operator → the original italic "relationships are a moat" line
 *   - coach    → a quiet borrowed call-out (quote + attribution)
 *   Practice-area pills sit in the coda's trailing column in both modes.
 */

import { useState } from 'react'
import {
  TrendingUp,
  Users,
  Layers,
  ScanSearch,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react'
import { useMode, type Mode } from './useMode'
import { FEATURED_TESTIMONIALS } from './SectionTestimonials'

/* ─── Data ──────────────────────────────────────────────────────────── */

type ModeCard = { Icon: LucideIcon; title: string; lede: string }

const OUTCOMES: Record<Mode, ModeCard[]> = {
  operator: [
    {
      Icon: TrendingUp,
      title: 'Revenue That Lasts',
      lede: 'Disciplined teams that beat the number quarter after quarter — not just once.',
    },
    {
      Icon: Users,
      title: 'Teams That Scale',
      lede: "People who grow, systems that improve, and a bench that's ready before you need it.",
    },
    {
      Icon: Layers,
      title: 'Businesses That Run Themselves',
      lede: 'People grow. Systems improve. Profits compound.',
    },
  ],
  coach: [
    {
      Icon: ScanSearch,
      title: 'Clarity',
      lede: "See what's actually going on — underneath the noise, the story, and the symptom.",
    },
    {
      Icon: BadgeCheck,
      title: 'Confidence',
      lede: "A defined next move that's yours to own, and the conviction to make it.",
    },
  ],
}

const PRACTICE_AREAS = ['Revenue', 'Operations', 'Product', 'Leadership']

/** Operator-mode coda — Jeff's own point of view (no quote marks). */
const POV = {
  quote:
    'Underneath all of it: relationships are a moat. Durable businesses know their customers, understand their pains, and help them win.',
  who: 'Jeff Lougheed',
  role: 'Operator & Coach',
}

const MODE_LABELS: [Mode, string][] = [
  ['operator', 'Special Projects'],
  ['coach', 'Coaching'],
]

/* ─── Shared sub-components ──────────────────────────────────────────── */

function ModeToggle({
  mode,
  setMode,
}: {
  mode: Mode
  setMode: (m: Mode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Special Projects or Coaching"
      className="flex flex-wrap gap-2.5 mb-16"
    >
      {MODE_LABELS.map(([id, label]) => {
        const on = mode === id
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => setMode(id)}
            className={[
              'inline-flex items-center gap-2 rounded-full border px-4 py-[9px]',
              'font-body text-[13px] font-medium tracking-[0.01em] cursor-pointer',
              'transition-colors duration-150',
              on
                ? 'bg-[color:var(--color-text-primary)] border-[color:var(--color-text-primary)] text-bg'
                : 'bg-surface border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-hover)] hover:text-[color:var(--color-text-primary)]',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function ModeGrid({ items, modeKey }: { items: ModeCard[]; modeKey: Mode }) {
  const two = items.length === 2
  return (
    <div
      // key re-mounts the grid on mode change so the stagger replays
      key={modeKey + ':' + items.map((i) => i.title).join('|')}
      className={[
        'grid grid-cols-1',
        two
          ? 'min-[820px]:grid-cols-2 min-[820px]:gap-x-24 max-w-[820px]'
          : 'min-[820px]:grid-cols-3 min-[820px]:gap-x-16',
      ].join(' ')}
    >
      {items.map((it, i) => {
        const Icon = it.Icon
        return (
          <div
            key={it.title}
            style={{ animationDelay: i * 70 + 'ms' }}
            className="pt-[30px] border-t border-[color:var(--color-border)] [animation:jlRise_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]"
          >
            <Icon
              size={54}
              strokeWidth={1.6}
              aria-hidden
              className="text-[color:var(--color-text-primary)] mb-8"
            />
            <h3 className="font-display font-normal text-[clamp(27px,2.6vw,36px)] leading-[1.1] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-4 text-pretty">
              {it.title}
            </h3>
            <p className="font-body text-[17px] leading-[1.62] text-[color:var(--color-text-muted)] max-w-[34ch] text-pretty">
              {it.lede}
            </p>
          </div>
        )
      })}
    </div>
  )
}

type CalloutData = { quote: string; who: string; role: string; headshot?: string }

function CalloutFigure({ callout }: { callout: CalloutData }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = Boolean(callout.headshot) && !imgFailed
  const initials = callout.who
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  return (
    <figure className="m-0 max-w-[64ch] [animation:jlRise_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]">
      <div className="mb-4 flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">In their words</span>
        <span aria-hidden className="h-px flex-1 bg-[color:var(--color-border)] max-w-[120px]" />
      </div>
      <blockquote className="m-0 font-display italic text-[clamp(18px,1.7vw,21px)] leading-[1.5] text-[color:var(--color-text-primary)] text-pretty">
        &ldquo;{callout.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <span
          aria-label={callout.who}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#E8E1CF] font-body text-sm font-semibold text-[rgb(24_32_41)] shadow-[inset_0_0_0_1px_rgb(24_32_41/0.06)] overflow-hidden"
        >
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/sage/jefflougheed/headshots/${callout.headshot}.jpeg`}
              alt={callout.who}
              className="w-full h-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span aria-hidden>{initials}</span>
          )}
        </span>
        <span className="flex flex-col gap-0.5 font-mono text-[11px] tracking-[0.1em] uppercase text-[color:var(--color-text-dim)]">
          <span className="text-[color:var(--color-text-muted)]">{callout.who}</span>
          <span>{callout.role}</span>
        </span>
      </figcaption>
    </figure>
  )
}

function MyPovFigure() {
  const initials = POV.who
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  return (
    <figure className="m-0 max-w-[64ch] [animation:jlRise_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]">
      {/* eyebrow + rule (matches the "In their words" featured-head treatment) */}
      <div className="mb-4 flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">
          My POV
        </span>
        <span aria-hidden className="h-px flex-1 bg-[color:var(--color-border)] max-w-[120px]" />
      </div>
      <blockquote className="m-0 font-display italic text-[clamp(18px,1.7vw,21px)] leading-[1.5] text-[color:var(--color-text-primary)] text-pretty">
        {POV.quote}
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <span
          aria-label={POV.who}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#E8E1CF] font-body text-sm font-semibold text-[rgb(24_32_41)] shadow-[inset_0_0_0_1px_rgb(24_32_41/0.06)]"
        >
          <span aria-hidden>{initials}</span>
        </span>
        <span className="flex flex-col gap-0.5 font-mono text-[11px] tracking-[0.1em] uppercase text-[color:var(--color-text-dim)]">
          <span className="text-[color:var(--color-text-muted)]">{POV.who}</span>
          <span>{POV.role}</span>
        </span>
      </figcaption>
    </figure>
  )
}

function PracticeAreas() {
  return (
    <div className="flex flex-wrap gap-2 lg:justify-end" aria-label="Practice areas">
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
  )
}

function SectionKeyframes() {
  return (
    <style>{`
      /* Transform-only entrance: content stays at opacity:1 even when the
         animation timeline is frozen (background tab / print / PDF). */
      @keyframes jlRise {
        from { transform: translateY(8px) }
        to   { transform: none }
      }
      @media (prefers-reduced-motion: reduce) {
        [class*="[animation:jlRise"] { animation: none !important }
      }
    `}</style>
  )
}

/* ─── Main export ───────────────────────────────────────────────────── */

export function SectionOutcomes() {
  const [mode, setMode] = useMode()
  const jim = FEATURED_TESTIMONIALS.find((t) => t.name === 'Jim Schnepp')

  return (
    <section id="outcomes" className="py-16">
      <div className="max-w-[1100px] mx-auto px-[clamp(24px,5vw,48px)]">
        {/* Eyebrow */}
        <p className="font-mono text-[13.2px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)] mb-6 flex items-center gap-4">
          <span>Fewer fires. Clearer priorities.</span>
          <span
            aria-hidden
            className="flex-1 h-px bg-[color:var(--color-border)] max-w-[160px]"
          />
        </p>

        {/* Headline */}
        <h2 className="font-display text-[clamp(30px,4vw,52px)] font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-8 text-balance">
          Outcomes I focus on
        </h2>

        {/* Operator / Coach toggle (shared) */}
        <ModeToggle mode={mode} setMode={setMode} />

        {/* Mode-specific cards */}
        <ModeGrid items={OUTCOMES[mode]} modeKey={mode} />

        {/* Coda */}
        <div className="mt-[72px] pt-8 border-t border-[color:var(--color-border)] grid grid-cols-1 lg:grid-cols-[1fr_auto] items-end gap-7 lg:gap-12">
          {mode === 'coach' ? (
            jim && (
              <CalloutFigure
                callout={{ quote: jim.text, who: jim.name, role: jim.title ?? '', headshot: jim.headshot }}
              />
            )
          ) : (
            <MyPovFigure />
          )}
          <PracticeAreas />
        </div>
      </div>

      <SectionKeyframes />
    </section>
  )
}

export default SectionOutcomes
