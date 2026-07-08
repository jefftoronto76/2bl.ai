'use client'

/**
 * SectionWhy — "How I work"
 * ──────────────────────────
 * Mode-aware editorial section, twin to SectionOutcomes. The same shared
 * Operator/Coach toggle (useMode) re-skins this block into fewer, larger
 * principle statements per mode.
 *
 * Coda:
 *   - operator → the original italic "close to ownership" line
 *   - coach    → a quiet borrowed call-out (quote + attribution)
 */

import { useState } from 'react'
import {
  ScanSearch,
  ArrowRight,
  ShieldCheck,
  GraduationCap,
  Handshake,
  type LucideIcon,
} from 'lucide-react'
import { useMode, type Mode } from './useMode'
import { FEATURED_TESTIMONIALS } from './SectionTestimonials'

/* ─── Data ──────────────────────────────────────────────────────────── */

type ModeCard = { Icon: LucideIcon; title: string; lede: string }

const PRINCIPLES: Record<Mode, ModeCard[]> = {
  operator: [
    {
      Icon: ScanSearch,
      title: 'Signal Over Noise',
      lede: 'Find the few things actually shaping performance, and fix those.',
    },
    {
      Icon: ArrowRight,
      title: 'Progress Over Process',
      lede: 'Processes should support the work, not become the work.',
    },
    {
      Icon: ShieldCheck,
      title: 'Owner Mindset',
      lede: "I treat every decision like the business is mine — that's how durable companies get built.",
    },
  ],
  coach: [
    {
      Icon: GraduationCap,
      title: 'Structured Coaching',
      lede: 'ICF-certified methodology. Agenda-free conversations that go beneath the surface.',
    },
    {
      Icon: Handshake,
      title: 'Owner Perspective',
      lede: "I've sat in the owner's chair, and I bring that lens to every conversation.",
    },
  ],
}

/** Operator-mode coda — Jeff's own point of view (no quote marks). */
const POV = {
  quote:
    'Most of my career has been spent close to ownership. It shapes how I lead, build, and make decisions.',
  who: 'Jeff Lougheed',
  role: 'Operator & Coach',
}

const PRACTICE_AREAS = ['Revenue', 'Operations', 'Product', 'Leadership']

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
                ? 'bg-[color:var(--color-text-primary)] border-[color:var(--color-text-primary)] text-[rgb(var(--color-bg))]'
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
  const [imgFailed, setImgFailed] = useState(false)
  const initials = POV.who
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  return (
    <figure className="m-0 max-w-[64ch] [animation:jlRise_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]">
      <div className="flex items-center gap-4 mb-[18px]">
        <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">
          My POV
        </span>
        <span
          aria-hidden
          className="flex-1 h-px max-w-[160px] bg-[color:var(--color-border)]"
        />
      </div>
      <blockquote className="m-0 font-display italic text-[clamp(18px,1.7vw,21px)] leading-[1.5] text-[color:var(--color-text-primary)] text-pretty">
        {POV.quote}
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <span
          aria-label={POV.who}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#E8E1CF] font-body text-sm font-semibold text-[rgb(24_32_41)] shadow-[inset_0_0_0_1px_rgb(24_32_41/0.06)] overflow-hidden"
        >
          {imgFailed ? (
            <span aria-hidden>{initials}</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/sage/jefflougheed/headshots/jeff-lougheed.jpeg"
              alt={POV.who}
              className="w-full h-full object-cover"
              onError={() => setImgFailed(true)}
            />
          )}
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

export function SectionWhy() {
  const [mode, setMode] = useMode()
  const iara = FEATURED_TESTIMONIALS.find((t) => t.name === 'Iara Rios')

  return (
    <section id="why" className="py-16">
      <div className="max-w-[1100px] mx-auto px-[clamp(24px,5vw,48px)]">
        {/* Eyebrow */}
        <p className="font-mono text-[13.2px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)] mb-6 flex items-center gap-4">
          <span>Show up, listen, and contribute.</span>
          <span
            aria-hidden
            className="flex-1 h-px bg-[color:var(--color-border)] max-w-[160px]"
          />
        </p>

        {/* Headline */}
        <h2 className="font-display text-[clamp(30px,4vw,52px)] font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-8 text-balance">
          How I work
        </h2>

        {/* Operator / Coach toggle (shared) */}
        <ModeToggle mode={mode} setMode={setMode} />

        {/* Mode-specific cards */}
        <ModeGrid items={PRINCIPLES[mode]} modeKey={mode} />

        {/* Coda */}
        <div className="mt-[72px] pt-8 border-t border-[color:var(--color-border)] grid grid-cols-1 lg:grid-cols-[1fr_auto] items-end gap-7 lg:gap-12">
          {mode === 'coach' ? (
            iara && (
              <CalloutFigure
                callout={{ quote: iara.text, who: iara.name, role: iara.company ?? iara.title ?? '', headshot: iara.headshot }}
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

export default SectionWhy
