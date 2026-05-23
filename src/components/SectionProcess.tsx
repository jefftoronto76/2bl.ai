/**
 * SectionProcess
 *
 * "How it works" section — lane selector.
 *
 *   Eyebrow ─ headline (with italic accent run) + rotating testimonial card
 *   Two lane cards (Coaching / Embedded Execution) act as a selector
 *   On select → the chosen lane collapses to a confirmation strip, and the
 *     step cards + deliverables tray for that lane reveal below
 *   Dark block with "Ask Sage" CTA (opens Sage in question mode)
 *
 * Colors use the inkwell palette tokens only — no hardcoded hex. The dark
 * Sage panel uses `var(--color-text-primary)` as its fill: under the live
 * inkwell palette that resolves to the dark navy (#182029, the hero canvas
 * color); under the plain `:root` fallback it is dark near-black. Light
 * `text-bg` copy stays readable on both. This mirrors how the inkwell theme
 * builds its other dark fills (`rgb(var(--ink-rgb))`).
 *
 * Fonts resolve through `font-display` / `font-body` / `font-mono`, wired to
 * Playfair Display / DM Sans / DM Mono in `tailwind.config.js`.
 *
 * The lane step/deliverable content comes from the TRACKS data below. The
 * "Ask Sage" / "Not sure which fits?" CTAs open the Sage overlay in question
 * mode via the shared `useSageStore`. The displayed testimonial rotates per
 * page load from the featured set defined in `SectionTestimonials`.
 */

'use client';

import { useEffect, useState, type FC, type ReactNode } from 'react';
import { ShieldCheck, FileText, Files, type LucideIcon } from 'lucide-react';
import { useSageStore } from '../lib/store';
import { FEATURED_TESTIMONIALS } from './SectionTestimonials';

/* ─── Wiring defaults ───────────────────────────────────────────────── */

/** Default href for the step-1 "Book a Session — C$250" CTA. Empty renders
 *  the button disabled until a real booking URL is wired in. */
const CTA_URL = '';

/* ─── Types ─────────────────────────────────────────────────────────── */

type LaneId = 'coaching' | 'operator';

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  company: string;
}

type Step = { title: string; body: string };

type DeliverableIconKind = 'shield' | 'transcript' | 'docs';

type Deliverable = {
  icon: DeliverableIconKind;
  title: string;
  body: string;
};

type Track = {
  id: LaneId;
  steps: [Step, Step, Step];
  deliverables: {
    /** 0-indexed step the deliverables "come from" — drives the origin-card
     *  accent and the desktop tray's notch position. */
    originStep: 0 | 1 | 2;
    items: Deliverable[];
  };
};

/* ─── Data ──────────────────────────────────────────────────────────── */

/** Display label for each lane, shown in the confirmation strip. Keyed to the
 *  lane-card eyebrows so the strip echoes the card the visitor chose. */
const LANE_LABEL: Record<LaneId, string> = {
  coaching: 'Coaching',
  operator: 'Embedded Execution',
};

const TRACKS: Record<LaneId, Track> = {
  coaching: {
    id: 'coaching',
    steps: [
      {
        title: 'Book a session',
        body: 'Talk to Sage if you need to think it through. When you’re ready, one session is all it takes to start.',
      },
      {
        title: 'The session',
        body: 'ICF-certified coaching methodology. A conversation that goes beneath the surface — agenda-free, focused on what’s actually in the way.',
      },
      {
        title: 'The shift',
        body: 'Clarity on what’s really going on. A defined next move that’s yours to own.',
      },
    ],
    deliverables: {
      originStep: 1,
      items: [
        { icon: 'transcript', title: 'Call transcript', body: 'You own it. Use it however helps most.' },
        { icon: 'shield', title: '100% satisfaction guarantee', body: 'If it wasn’t worth it, you don’t pay.' },
      ],
    },
  },
  operator: {
    id: 'operator',
    steps: [
      {
        title: 'Book a session',
        body: 'Talk to Sage if you need to think it through. When you’re ready, one session is all it takes to start.',
      },
      {
        title: 'Working Session',
        body: 'Bring the problem. We’ll leverage ICF competencies, along with our own expertise, to determine the outcome we need and how to achieve it.',
      },
      {
        title: 'The shift',
        body: 'Clarity on what’s really going on. A defined next move for you to consider.',
      },
    ],
    deliverables: {
      originStep: 1,
      items: [
        { icon: 'transcript', title: 'Call transcript', body: 'You own it. Use it however helps most.' },
        { icon: 'shield', title: '100% satisfaction guarantee', body: 'If it wasn’t worth it, you don’t pay.' },
        {
          icon: 'docs',
          title: 'Go-forward strategy',
          body: 'A plan on next steps, focused on clear outcomes, action items, timelines and budget.',
        },
      ],
    },
  },
};

const DELIVERABLE_ICON: Record<DeliverableIconKind, LucideIcon> = {
  shield: ShieldCheck,
  transcript: FileText,
  docs: Files,
};

/* ─── Static class lookups ──────────────────────────────────────────── */

/** Notch column-center positions for a 3-column grid. Hardcoded so Tailwind
 *  sees the class strings at build time. */
const NOTCH_LEFT_BY_STEP = ['left-[16.667%]', 'left-[50%]', 'left-[83.333%]'] as const;

const CARD_DELAY = ['[animation-delay:0ms]', '[animation-delay:50ms]', '[animation-delay:100ms]'] as const;

const DELIV_DELAY = ['[animation-delay:0ms]', '[animation-delay:70ms]', '[animation-delay:140ms]'] as const;

const MOBILE_DELIV_DELAY = [
  '[animation-delay:140ms]',
  '[animation-delay:200ms]',
  '[animation-delay:260ms]',
] as const;

/* ─── Component ─────────────────────────────────────────────────────── */

export interface SectionProcessProps {
  /** Optional override for the section's id (anchor target). */
  id?: string;
  className?: string;
}

export const SectionProcess: FC<SectionProcessProps> = ({ id = 'how-it-works', className }) => {
  const expand = useSageStore((s) => s.expand);

  const goToSage = () => {
    if (typeof window !== 'undefined' && window.location.hash !== '#chat?mode=question') {
      history.pushState(null, '', '/#chat?mode=question');
    }
    expand('question');
  };

  // Which lane the visitor selected. null = still choosing (both cards shown).
  const [selectedLane, setSelectedLane] = useState<LaneId | null>(null);

  // Rotating featured testimonial. Seed a deterministic index for SSR + first
  // client render (no hydration mismatch), then pick a random one after mount.
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (FEATURED_TESTIMONIALS.length > 1) {
      setIdx(Math.floor(Math.random() * FEATURED_TESTIMONIALS.length));
    }
  }, []);

  const source = FEATURED_TESTIMONIALS[idx];
  const testimonial: Testimonial | null = source
    ? {
        quote: source.text,
        name: source.name,
        title: source.title ?? '',
        company: source.company ?? '',
      }
    : null;

  const stepsRegionId = `${id}-steps`;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className={[
        'border-y border-[color:var(--color-border)]',
        'bg-bg text-[color:var(--color-text-primary)]',
        'px-6 py-16 sm:px-10 sm:py-20 lg:px-12 lg:py-24',
        className ?? '',
      ].join(' ')}
    >
      <div className="mx-auto max-w-[1100px]">
        {/* Eyebrow */}
        <p className="mb-7 flex items-center gap-4 font-mono text-[13.2px] uppercase tracking-[0.22em] text-[color:var(--color-text-dim)]">
          <span className="rounded-sm bg-accent/20 px-1">How it works</span>
          <span aria-hidden="true" className="block h-px max-w-[120px] flex-1 bg-[color:var(--color-border)]" />
        </p>

        {/* Header row: headline + testimonial */}
        <div className="mb-10 grid grid-cols-1 items-center gap-6 lg:mb-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <h2
            id={`${id}-h`}
            className="m-0 font-display text-[clamp(30px,4vw,52px)] font-normal leading-[1.08] tracking-[-0.02em] text-pretty"
          >
            It starts with
            <br />
            <em className="font-display italic text-accent">one conversation.</em>
          </h2>

          {testimonial ? <TestimonialCard testimonial={testimonial} /> : null}
        </div>

        {/* Lane selector ⇄ confirmation strip + revealed steps */}
        {selectedLane === null ? (
          <div className="mb-7 grid grid-cols-1 gap-4 lg:mb-8 lg:grid-cols-2 lg:gap-10">
            <LaneCard
              eyebrow={LANE_LABEL.coaching}
              headline="For ambitious professionals"
              body="Structured 1:1 coaching engagements to help you sharpen your thinking, navigate complex decisions, and grow into the next version of your leadership."
              trust="ICF-Certified · Royal Roads University"
              ctaLabel="This is my lane"
              controls={stepsRegionId}
              onSelect={() => setSelectedLane('coaching')}
            />
            <LaneCard
              eyebrow={LANE_LABEL.operator}
              headline="For founders, CEOs, and PE leaders"
              body="Hands-in-the-business work alongside your team — turning strategy into shipped outcomes when the bar is high and the timeline is short."
              ctaLabel="This is my lane"
              controls={stepsRegionId}
              onSelect={() => setSelectedLane('operator')}
            />
          </div>
        ) : (
          <>
            <LaneConfirmStrip
              label={LANE_LABEL[selectedLane]}
              onSwitch={() => setSelectedLane(null)}
            />
            <LaneReveal id={stepsRegionId} label={LANE_LABEL[selectedLane]} track={TRACKS[selectedLane]} />
          </>
        )}

        {/* Dark CTA block */}
        <SagePanel onAskSage={goToSage} />
      </div>

      <SectionKeyframes />
    </section>
  );
};

export default SectionProcess;

/* ─── Subcomponents ─────────────────────────────────────────────────── */

interface TestimonialCardProps {
  testimonial: Testimonial;
}

const TestimonialCard: FC<TestimonialCardProps> = ({ testimonial }) => {
  const initials = getInitials(testimonial.name);

  return (
    <figure className="relative m-0 rounded-2xl border border-[color:var(--color-border)] bg-surface p-7 shadow-[0_4px_24px_rgba(26,25,23,0.04)]">
      {/* Decorative quote mark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-3 select-none font-display text-[80px] italic leading-[0.8] text-accent/15"
      >
        &rdquo;
      </span>

      <blockquote className="m-0 mb-5 pr-9 font-display text-[14px] font-normal italic leading-[1.5] text-[color:var(--color-text-primary)]">
        &ldquo;{testimonial.quote}&rdquo;
      </blockquote>

      <figcaption className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent/12 font-body text-xs font-semibold tracking-[0.04em] text-accent"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="font-body text-[12px] font-semibold leading-tight text-[color:var(--color-text-primary)]">
            {testimonial.name}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-dim)]">
            {testimonial.title}
            {testimonial.title && testimonial.company ? ' · ' : ''}
            {testimonial.company}
          </div>
        </div>
      </figcaption>
    </figure>
  );
};

interface LaneCardProps {
  eyebrow: string;
  headline: string;
  body: string;
  trust?: string;
  ctaLabel: string;
  controls: string;
  onSelect: () => void;
}

const LaneCard: FC<LaneCardProps> = ({ eyebrow, headline, body, trust, ctaLabel, controls, onSelect }) => {
  return (
    <article className="group relative flex flex-col gap-5 rounded-[20px] border border-[color:var(--color-border)] bg-surface p-9 pb-9 pt-10 shadow-[0_4px_24px_rgba(26,25,23,0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-accent/40 hover:shadow-[0_8px_32px_rgba(26,25,23,0.07)]">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-dim)]">
        {eyebrow}
      </div>

      <h3 className="m-0 font-display text-[clamp(24px,2.6vw,32px)] font-normal leading-[1.02] tracking-[-0.02em] text-[color:var(--color-text-primary)]">
        {headline}
      </h3>

      <p className="m-0 max-w-[44ch] font-body text-[16px] leading-[1.6] text-[color:var(--color-text-muted)]">
        {body}
      </p>

      <div className="flex-1" aria-hidden="true" />

      {trust ? (
        <div className="flex items-center gap-2.5 pb-1 pt-1.5">
          <CredentialMark />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-dim)]">
            {trust}
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        aria-controls={controls}
        className="mt-2 inline-flex items-center gap-2.5 self-start whitespace-nowrap rounded-full border-0 bg-accent px-5 py-3 font-body text-[14.5px] font-semibold tracking-[0.01em] text-bg transition-[background-color,transform] duration-150 hover:bg-[color:var(--color-accent-hover)]"
      >
        {ctaLabel}
        <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
      </button>
    </article>
  );
};

interface LaneConfirmStripProps {
  label: string;
  onSwitch: () => void;
}

const LaneConfirmStrip: FC<LaneConfirmStripProps> = ({ label, onSwitch }) => {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-accent/[0.06] px-5 py-4 lg:mb-8">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-bg"
        >
          <Check />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-dim)]">
          Your lane
        </span>
        <span className="truncate font-display text-[20px] font-normal leading-tight tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {label}
        </span>
      </div>

      <button
        type="button"
        onClick={onSwitch}
        className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--color-border)] bg-surface px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-muted)] transition-colors duration-150 hover:border-[color:var(--color-border-hover)] hover:text-[color:var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Switch lane
      </button>
    </div>
  );
};

interface LaneRevealProps {
  id: string;
  label: string;
  track: Track;
}

const LaneReveal: FC<LaneRevealProps> = ({ id, label, track }) => {
  return (
    <div id={id} role="region" aria-label={`${label} engagement steps`} key={track.id}>
      {/* Step cards — 3 cols on desktop, stacked on mobile. Mobile tray slots
          inline after the originStep card; desktop tray renders separately. */}
      <div className="mb-10 grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-6">
        {track.steps.map((s, i) => {
          const isOrigin = track.deliverables.originStep === i;
          return (
            <div key={track.id + 'cell' + i} className="contents lg:contents">
              <StepCard step={s} index={i} isOrigin={isOrigin} ctaUrl={CTA_URL} />
              {i === track.deliverables.originStep && (
                <div className="lg:hidden">
                  <MobileTray track={track} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop tray with notch (hidden on mobile). */}
      <div className="mb-10 hidden lg:block">
        <DesktopTray track={track} />
      </div>
    </div>
  );
};

function CTAButton({ href }: { href: string }) {
  const isLive = href.length > 0;
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
      <ArrowRight />
    </a>
  );
}

function StepCard({
  step,
  index,
  isOrigin,
  ctaUrl,
}: {
  step: Step;
  index: number;
  isOrigin: boolean;
  ctaUrl: string;
}) {
  const number = String(index + 1).padStart(2, '0');
  return (
    <article
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
        <span className="font-mono text-[13px] leading-none tracking-[0.18em] text-[color:var(--color-text-dim)]">
          {number}
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
  );
}

function DeliverableTile({ d, delay }: { d: Deliverable; delay: string }) {
  const Icon = DELIVERABLE_ICON[d.icon];
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
  );
}

function DesktopTray({ track }: { track: Track }) {
  const { originStep, items } = track.deliverables;
  const notchLeft = NOTCH_LEFT_BY_STEP[originStep];
  const fromLabel = `From step ${String(originStep + 1).padStart(2, '0')}`;

  return (
    <div className="relative rounded-[20px] border border-accent/[0.16] bg-accent/[0.045] px-6 pt-8 pb-7">
      <span
        aria-hidden
        className={[
          'absolute -top-[8px] block h-[14px] w-[14px] -translate-x-1/2 rotate-45',
          'border-l border-t border-accent/35 bg-accent/[0.045]',
          notchLeft,
        ].join(' ')}
      />

      <div className="mb-[18px] flex items-center gap-3">
        <p className="m-0 font-mono text-[11px] tracking-[0.22em] uppercase text-accent">
          What you&rsquo;ll walk away with
        </p>
        <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-surface px-2 py-1 font-mono text-[10.5px] tracking-[0.18em] uppercase text-[color:var(--color-text-dim)] [animation:hiwPop_0.4s_ease_both]">
          {fromLabel}
        </span>
        <span aria-hidden className="h-px flex-1 bg-accent/[0.16]" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {items.map((d, i) => (
          <DeliverableTile key={track.id + 'd' + i} d={d} delay={DELIV_DELAY[i] ?? DELIV_DELAY[0]} />
        ))}
      </div>
    </div>
  );
}

function MobileTray({ track }: { track: Track }) {
  const { items } = track.deliverables;
  return (
    <div className="rounded-[14px] border border-accent/25 bg-accent/[0.045] px-[18px] py-5 overflow-hidden [animation:hiwMobileTrayIn_0.45s_cubic-bezier(0.65,0,0.35,1)_both]">
      <div className="mb-3.5 flex items-center gap-2.5">
        <p className="m-0 font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
          What&rsquo;s included
        </p>
        <span aria-hidden className="h-px flex-1 bg-accent/[0.18]" />
      </div>

      <div className="flex flex-col gap-3">
        {items.map((d, i) => {
          const Icon = DELIVERABLE_ICON[d.icon];
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
          );
        })}
      </div>
    </div>
  );
}

interface SagePanelProps {
  onAskSage: () => void;
}

const SagePanel: FC<SagePanelProps> = ({ onAskSage }) => {
  return (
    <section
      aria-label="Talk to Sage"
      className="relative overflow-hidden rounded-3xl bg-[color:var(--color-text-primary)] p-8 text-bg sm:p-12"
    >
      {/* Soft accent halo, top-right */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-accent/30 blur-[60px]"
      />

      <div className="relative flex max-w-[640px] flex-col items-start gap-5">
        <h4 className="m-0 font-body text-xl font-semibold leading-snug tracking-[-0.01em] text-pretty">
          Not sure which fits?
        </h4>

        <p className="m-0 max-w-[52ch] font-body text-[15px] leading-[1.6] text-bg/70 sm:text-base">
          Sage can help you figure out the right lane &mdash; or whether this is the right fit at
          all.
        </p>

        <button
          type="button"
          onClick={onAskSage}
          className="group/cta mt-2 inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border-0 bg-accent px-5 py-3 font-body text-[14.5px] font-semibold tracking-[0.01em] text-bg transition-[background-color,transform] duration-150 hover:bg-[color:var(--color-accent-hover)]"
        >
          Ask Sage
          <ArrowRight className="transition-transform duration-150 group-hover/cta:translate-x-0.5" />
        </button>
      </div>
    </section>
  );
};

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
      }
    `}</style>
  );
}

/* ─── Atoms ─────────────────────────────────────────────────────────── */

interface ArrowRightProps {
  className?: string;
}

const ArrowRight: FC<ArrowRightProps> = ({ className }) => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const Check: FC = () => (
  <svg
    width={13}
    height={13}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** Compact credential mark — placeholder for an ICF badge SVG. */
const CredentialMark: FC = (): ReactNode => (
  <span
    aria-hidden="true"
    className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-accent/45 font-display text-[11px] italic text-accent"
  >
    i
  </span>
);

/* ─── Helpers ───────────────────────────────────────────────────────── */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
