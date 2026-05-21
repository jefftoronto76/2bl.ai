/**
 * SectionProcess
 *
 * "How it works" section — lane selector v5.
 *
 *   Eyebrow ─ headline (with italic accent run) + testimonial card
 *   Two lane cards (Coaching / Embedded Execution)
 *   Dark block with "Ask Sage" CTA
 *
 * Colors use the inkwell palette tokens (`bg`/`surface`/`accent` +
 * `var(--color-*)`) rather than inlined hex, so the section stays on the
 * jefflougheed design system. The one exception is the dark Sage panel
 * (`#0d1f1a`) — it has no palette sibling, so it stays an arbitrary value.
 *
 * Fonts resolve through `font-display` / `font-body` / `font-mono`, wired to
 * Playfair Display / DM Sans / DM Mono in `tailwind.config.js`.
 *
 * Both CTAs (lane cards + "Ask Sage") open the Sage overlay in question mode
 * via the shared `useSageStore`. The displayed testimonial rotates per page
 * load from the featured set defined in `SectionTestimonials`.
 */

'use client';

import { useEffect, useState, type FC, type ReactNode } from 'react';
import { useSageStore } from '../lib/store';
import { FEATURED_TESTIMONIALS } from './SectionTestimonials';

/* ─── Types ─────────────────────────────────────────────────────────── */

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  company: string;
}

export interface SectionProcessProps {
  /** Optional override for the section's id (anchor target). */
  id?: string;
  className?: string;
}

/* ─── Component ─────────────────────────────────────────────────────── */

export const SectionProcess: FC<SectionProcessProps> = ({
  id = 'how-it-works',
  className,
}) => {
  const expand = useSageStore((s) => s.expand);

  const goToSage = () => {
    if (typeof window !== 'undefined' && window.location.hash !== '#chat?mode=question') {
      history.pushState(null, '', '/#chat?mode=question');
    }
    expand('question');
  };

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
        <p className="mb-7 flex items-center gap-4 font-mono text-[13px] font-medium uppercase tracking-[0.22em] text-[color:var(--color-text-dim)]">
          <span className="rounded-sm bg-accent/20 px-1">How it works</span>
          <span aria-hidden="true" className="block h-px max-w-[120px] flex-1 bg-[color:var(--color-border)]" />
        </p>

        {/* Header row: headline + testimonial */}
        <div className="mb-10 grid grid-cols-1 items-center gap-6 lg:mb-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <h2
            id={`${id}-h`}
            className="m-0 font-display text-[clamp(34px,4.2vw,56px)] font-normal leading-[1.06] tracking-[-0.02em] text-pretty"
          >
            It starts with
            <br />
            <em className="font-display italic text-accent">one conversation.</em>
          </h2>

          {testimonial ? <TestimonialCard testimonial={testimonial} /> : null}
        </div>

        {/* Lane cards */}
        <div className="mb-7 grid grid-cols-1 gap-4 lg:mb-8 lg:grid-cols-2 lg:gap-6">
          <LaneCard
            eyebrow="Coaching"
            headline="For ambitious professionals"
            body="Structured 1:1 coaching engagements to help you sharpen your thinking, navigate complex decisions, and grow into the next version of your leadership."
            trust="ICF-Certified · Royal Roads University"
            ctaLabel="This is my lane"
            onSelect={goToSage}
          />
          <LaneCard
            eyebrow="Embedded Execution"
            headline="For founders, CEOs, and PE leaders"
            body="Hands-in-the-business work alongside your team — turning strategy into shipped outcomes when the bar is high and the timeline is short."
            ctaLabel="This is my lane"
            onSelect={goToSage}
          />
        </div>

        {/* Dark CTA block */}
        <SagePanel onAskSage={goToSage} />
      </div>
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

      <blockquote className="m-0 mb-5 pr-9 font-display text-[19px] font-normal italic leading-[1.5] text-[color:var(--color-text-primary)]">
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
          <div className="font-body text-sm font-semibold leading-tight text-[color:var(--color-text-primary)]">
            {testimonial.name}
          </div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-dim)]">
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
  onSelect: () => void;
}

const LaneCard: FC<LaneCardProps> = ({ eyebrow, headline, body, trust, ctaLabel, onSelect }) => {
  return (
    <article className="group relative flex min-h-[360px] flex-col gap-5 rounded-[20px] border border-[color:var(--color-border)] bg-surface p-9 pb-9 pt-10 shadow-[0_4px_24px_rgba(26,25,23,0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-accent/40 hover:shadow-[0_8px_32px_rgba(26,25,23,0.07)]">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text-dim)]">
        {eyebrow}
      </div>

      <h3 className="m-0 font-display text-[clamp(36px,3.6vw,48px)] font-normal leading-[1.02] tracking-[-0.02em] text-[color:var(--color-text-primary)]">
        {headline}
      </h3>

      <p className="m-0 max-w-[44ch] font-body text-[17px] leading-[1.6] text-[color:var(--color-text-muted)]">
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
        className="mt-2 inline-flex items-center gap-2.5 self-start whitespace-nowrap rounded-full border-0 bg-accent px-5 py-3 font-body text-[14.5px] font-semibold tracking-[0.01em] text-bg transition-[background-color,transform] duration-150 hover:bg-[color:var(--color-accent-hover)]"
      >
        {ctaLabel}
        <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
      </button>
    </article>
  );
};

interface SagePanelProps {
  onAskSage: () => void;
}

const SagePanel: FC<SagePanelProps> = ({ onAskSage }) => {
  return (
    <section
      aria-label="Talk to Sage"
      className="relative overflow-hidden rounded-3xl bg-[#0d1f1a] p-8 text-bg sm:p-12"
    >
      {/* Soft accent halo, top-right */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-accent/30 blur-[60px]"
      />

      <div className="relative flex max-w-[640px] flex-col items-start gap-5">
        <h3 className="m-0 font-display text-[clamp(26px,3vw,40px)] font-normal italic leading-[1.1] tracking-[-0.015em] text-pretty">
          Not sure which fits?
        </h3>

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
