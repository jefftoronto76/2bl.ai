// ──────────────────────────────────────────────────────────────────────
// HowItWorks.tsx
//
// Section: How It Works — three-step process for the C$250 working session.
// Replaces the prior `Stack()` section in app/secondbrainlabs/page.tsx.
//
// HOW TO USE THIS FILE:
//   This is a drop-in fragment, not a standalone module. Two options:
//
//   (A) Inline — paste the body of this file into page.tsx where
//       `function Stack()` used to live. Drop the imports at the top
//       (they're already present in page.tsx) and the trailing `export`.
//       This is the recommended path; matches the current convention of
//       keeping the SBL landing page as a single file.
//
//   (B) Extract — keep this as its own file at
//       app/secondbrainlabs/_components/HowItWorks.tsx, and import
//       `HowItWorks` from page.tsx. The primitives `Bay` and `Arrow`
//       are currently scoped to page.tsx, so option B requires either
//       (i) lifting Bay + Arrow into a shared primitives module, or
//       (ii) passing them in as props — both more refactor than the
//       drop-in case warrants.
//
// DEPENDENCIES:
//   - Reuses Bay, Arrow primitives from page.tsx (no changes to them).
//   - No new npm dependencies. All icons inline.
//   - No client state — pure server component. Safe inside a server file.
//
// THEME:
//   - Uses existing SBL terracotta tokens: accent, accent-deep, accent-soft.
//   - Tokens are scoped via [data-brand="sbl"] on the route layout.
//     Don't render outside that wrapper.
//
// BEFORE MERGE:
//   - Replace BOOKING_URL with the real Calendly link.
//   - Confirm CTA currency (C$250 = Canadian dollars; remove `C` if global).
//   - Decide on lede punctuation — see implementation.md QA checklist.
//
// Source design: How It Works - Production.html in the design project.
// ──────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { ReactNode } from "react";

// ──────────────────────────────────────────────────────────────────────
// Data
// ──────────────────────────────────────────────────────────────────────

// Bookable session URL — REPLACE before merge.
const BOOKING_URL = "https://calendly.com/REPLACE-ME/working-session" as const;
const SESSION_PRICE = "C$250" as const;

type Step = {
  readonly id: string;
  readonly num: string;
  readonly tag: string;       // small mono caps label (Step / → Yields)
  readonly isYield?: boolean; // step 02 — different visual treatment
  readonly title: string;
  readonly body: string;
  readonly cta?: { label: string; href: string };
};

const STEPS: ReadonlyArray<Step> = [
  {
    id: "book",
    num: "01",
    tag: "Step",
    title: "Book a session",
    body:
      "Talk to Sage if you need to think it through. When you're ready, one session is all it takes to start.",
    cta: { label: `Book a Session — ${SESSION_PRICE}`, href: BOOKING_URL },
  },
  {
    id: "session",
    num: "02",
    tag: "→ Yields",
    isYield: true,
    title: "The session",
    body:
      "ICF-certified coaching methodology. A conversation that goes beneath the surface — agenda-free, focused on what's actually in the way.",
  },
  {
    id: "shift",
    num: "03",
    tag: "Step",
    title: "The shift",
    body:
      "Clarity on what's really going on. A defined next move that's yours to own.",
  },
] as const;

type Deliverable = {
  readonly id: string;
  readonly icon: "transcript" | "guarantee";
  readonly title: string;
  readonly body: string;
};

const DELIVERABLES: ReadonlyArray<Deliverable> = [
  {
    id: "transcript",
    icon: "transcript",
    title: "Call transcript",
    body: "You own it. Use it however helps most.",
  },
  {
    id: "guarantee",
    icon: "guarantee",
    title: "100% satisfaction guarantee",
    body: "If it wasn't worth it, you don't pay.",
  },
] as const;

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────

export function HowItWorks() {
  return (
    <Bay id="how-it-works" label="How it works">
      {/* Eyebrow row: kicker pill + horizontal rule.
          Custom markup (not the shared Kicker primitive) — the rule
          treatment is unique to this section. */}
      <div className="mb-6 sm:mb-10 flex items-center gap-4">
        <span className="inline-block rounded-[3px] bg-accent/15 px-2 py-0.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.22em] text-ink">
          How it works
        </span>
        <span aria-hidden className="hidden sm:block h-px max-w-[180px] flex-1 bg-ink/10" />
      </div>

      {/* Section header — single column, max-width capped to keep the
          lede a comfortable measure. */}
      <header className="mb-10 sm:mb-14 max-w-[720px]">
        <h2
          id="how-it-works-h"
          className="m-0 mb-[18px] font-serif font-normal leading-[1.04] tracking-[-0.02em] text-ink text-balance"
          style={{ fontSize: "clamp(36px, 4.6vw, 60px)" }}
        >
          Want help with your{" "}
          <em className="italic text-accent font-normal">product?</em>
        </h2>
        <p
          className="m-0 max-w-[56ch] font-sans leading-[1.55] text-ink-2 text-pretty"
          style={{ fontSize: "clamp(16px, 1.5vw, 18px)" }}
        >
          I&apos;m a revenue focused product builder, and, an executive coach, if you want to
          explore your product, book time below.
        </p>
      </header>

      {/* Three-step grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-3.5">
        {STEPS.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </div>

      {/* Connector — small upward chevron tying steps → walk-away */}
      <div aria-hidden className="my-5 sm:my-7 flex justify-center text-ink/25">
        <svg
          viewBox="0 0 20 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-5"
        >
          <path d="M2 12 L10 2 L18 12" />
        </svg>
      </div>

      {/* Walk-away block */}
      <section
        aria-label="What you'll walk away with"
        className="rounded-[18px] border border-line bg-paper p-5 sm:p-7"
      >
        <div className="mb-4 sm:mb-5 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.22em] text-muted">
            What you&apos;ll walk away with
          </span>
          <span className="inline-flex items-center rounded-full border border-line bg-white px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-2 whitespace-nowrap">
            From step 02
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {DELIVERABLES.map((d) => (
            <DeliverableCard key={d.id} deliverable={d} />
          ))}
        </div>
      </section>
    </Bay>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

function StepCard({ step }: { step: Step }) {
  // Terracotta recipes — local to this section.
  //   active bg:     color-mix(in oklab, var(--color-accent-soft) 60%, var(--color-paper))
  //   active border: border-accent (the global terracotta token)
  //   active shadow: rgba(200, 84, 46, 0.32)
  //   tag/num text:  text-accent-deep (global)
  //   hover border:  border-accent/40 (alpha-aware accent token)
  const active = step.isYield === true;
  return (
    <article
      className={[
        "group relative flex flex-col gap-3.5 rounded-2xl border p-6 sm:p-[28px_26px_26px] shadow-[0_4px_24px_rgba(31,26,20,0.04)] transition-[border-color,transform,box-shadow]",
        active
          ? "border-accent bg-[color-mix(in_oklab,var(--color-accent-soft)_60%,var(--color-paper))] shadow-[0_18px_36px_-28px_rgba(200,84,46,0.32)]"
          : "border-line bg-white hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_18px_36px_-28px_rgba(31,26,20,0.18)]",
      ].join(" ")}
      aria-current={active ? "step" : undefined}
    >
      <div className="mb-1 flex items-start justify-between">
        <span
          className={[
            "font-serif italic font-normal leading-[0.9] tracking-[-0.02em]",
            active ? "text-accent-deep" : "text-ink",
          ].join(" ")}
          style={{ fontSize: "56px" }}
        >
          {step.num}
        </span>
        <span
          className={[
            "mt-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.22em]",
            active ? "text-accent-deep" : "text-muted",
          ].join(" ")}
        >
          {step.tag}
        </span>
      </div>

      <h3 className="m-0 font-sans text-[17px] font-bold tracking-[-0.008em] text-ink leading-[1.3]">
        {step.title}
      </h3>

      <p className="m-0 font-sans text-[14.5px] leading-[1.55] text-ink-2 text-pretty">
        {step.body}
      </p>

      {step.cta ? (
        <Link
          href={step.cta.href}
          target={step.cta.href.startsWith("http") ? "_blank" : undefined}
          rel={step.cta.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="mt-auto group/cta inline-flex items-center gap-2.5 self-start whitespace-nowrap rounded-full bg-accent px-[18px] py-3 font-sans text-[13.5px] font-semibold leading-none text-white transition-colors hover:bg-accent-deep"
        >
          {step.cta.label}
          <Arrow className="transition-transform group-hover/cta:translate-x-0.5" />
        </Link>
      ) : null}
    </article>
  );
}

function DeliverableCard({ deliverable }: { deliverable: Deliverable }) {
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-line bg-white p-4 sm:p-5 transition-colors hover:border-accent/40">
      <span
        aria-hidden
        className="grid h-8 w-8 sm:h-9 sm:w-9 flex-none place-items-center rounded-[9px] border border-accent/40 bg-accent-soft text-accent"
      >
        {deliverable.icon === "transcript" ? <IconTranscript /> : <IconBadgeCheck />}
      </span>
      <div>
        <div className="font-sans text-[15px] font-semibold leading-[1.3] text-ink">
          {deliverable.title}
        </div>
        <div className="mt-0.5 font-sans text-[13px] leading-[1.45] text-muted">
          {deliverable.body}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inline icons (co-locate with the other IconFoo functions at the bottom
// of page.tsx — don't introduce a new icon library for these.)
// ──────────────────────────────────────────────────────────────────────

function IconTranscript() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8 H15" />
      <path d="M9 12 H15" />
      <path d="M9 16 H13" />
    </svg>
  );
}

function IconBadgeCheck() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2 L14.5 4.5 L18 4 L18.5 7.5 L21.5 9 L20 12 L21.5 15 L18.5 16.5 L18 20 L14.5 19.5 L12 22 L9.5 19.5 L6 20 L5.5 16.5 L2.5 15 L4 12 L2.5 9 L5.5 7.5 L6 4 L9.5 4.5 Z" />
      <path d="M9 12 L11 14 L15 10" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// External primitives referenced by this file (already defined in page.tsx):
//
//   • Bay({ id, label, tone, children })    — section wrapper, applies
//                                              max-width + vertical padding
//                                              + tone (paper / paper-2).
//   • Arrow({ className })                  — small "→" with hover translate.
//
// If you extract this file out of page.tsx, you'll need to import or
// duplicate those. See "HOW TO USE THIS FILE" comment at the top.
// ──────────────────────────────────────────────────────────────────────
