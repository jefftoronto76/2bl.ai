// app/page.tsx
//
// Second Brain Labs — public landing page.
// Next.js 15 App Router · React 19 · TypeScript strict · Tailwind only.
//
// Source design: Landing4.html (desktop) + Landing Mobile.html (iPhone preview).
// The desktop and mobile experiences share a single responsive component tree;
// the mobile preview is the same page rendered at <= 520px. See
// Implementation-handover.md for setup, theme tokens, and QA.

import Link from "next/link";
import type { ReactNode } from "react";
import { TrendingUp, Layers, Sparkles, ShieldCheck } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────
// Data
// ──────────────────────────────────────────────────────────────────────

type Project = {
  readonly id: string;
  readonly name: string;
  readonly initial: string;
  readonly tagline: string;
  readonly href: string;
  readonly domain: string;
};

const PROJECTS: ReadonlyArray<Project> = [
  { id: "sage",     name: "Sage",     initial: "S", tagline: "A chat-based operating system for service businesses.",  href: "/sage",     domain: "sage.secondbrain.labs" },
  { id: "heirloom", name: "Heirloom", initial: "H", tagline: "A platform for creating and sharing memories.",          href: "/heirloom", domain: "heirloom.secondbrain.labs" },
  { id: "hugs",     name: "HUGS",     initial: "H", tagline: "A social platform focused on connection before correction.", href: "/hugs",     domain: "hugs.secondbrain.labs" },
  { id: "ledger",   name: "Ledger",   initial: "L", tagline: "A trading journal focused on discipline and learning.",  href: "/ledger",   domain: "ledger.secondbrain.labs" },
] as const;

type SageStarter = { readonly id: string; readonly label: string; readonly q: string };

const SAGE_STARTERS: ReadonlyArray<SageStarter> = [
  { id: "work",     label: "What are you working on right now?", q: "What are you working on right now?" },
  { id: "fit",      label: "Which product fits my problem?",     q: "Which product fits my problem?" },
  { id: "team",     label: "Who's behind Second Brain Labs?",    q: "Who's behind Second Brain Labs?" },
  { id: "partner",  label: "Can we partner on something new?",   q: "Can we partner on something new?" },
] as const;

// ──────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="bg-paper text-ink font-sans antialiased selection:bg-accent-soft selection:text-ink">
      <Nav />
      <Hero />
      <Work />
      <HowIWork />
      <HowItWorks />
      <SiteFooter />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Nav
// ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="sticky top-0 z-40 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto flex h-14 sm:h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <div className="group relative flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.012em] whitespace-nowrap">
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-ink">
            <img src="/2bl/2blai_logo.svg" alt="" className="h-full w-full object-cover" />
          </span>
          <span className="hidden sm:inline">Second Brain Labs</span>

          {/* Desktop-only hover reveal — full logo illustration popover */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden origin-top-left scale-95 opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 motion-reduce:transition-none md:block"
          >
            <div className="rounded-xl border border-line bg-ink p-3 shadow-[0_20px_40px_-20px_rgba(31,26,20,0.45)]">
              <img src="/2bl/2blai_logo.svg" alt="" className="block h-[180px] w-[180px] object-contain" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <BtnGhost href="/sign-in">Sign in</BtnGhost>
          <BtnPrimary href="#chat">
            Chat <Arrow />
          </BtnPrimary>
        </div>
      </div>
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Hero
// ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <header id="top" className="py-10 sm:py-16 md:py-24 lg:py-32">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:px-12">
        <h1
          className="m-0 mb-7 font-serif font-normal leading-[1.02] tracking-[-0.022em] text-balance text-ink"
          style={{ fontSize: "clamp(36px, 4vw, 56px)" }}
        >
          Software people <em className="font-normal italic text-accent">actually want to use.</em>
        </h1>
        <p
          className="m-0 mb-7 sm:mb-11 font-serif italic font-normal leading-[1.35] text-ink-2 text-pretty"
          style={{ fontSize: "20px" }}
        >
          AI changes how software gets built and how people experience it. Second Brain Labs is putting that shift to work.
        </p>

        <SageWidget />
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sage AI widget
// ──────────────────────────────────────────────────────────────────────

function SageWidget() {
  return (
    <section
      id="chat"
      aria-label="Ask Sage about working with us"
      className="mt-10 sm:mt-12 md:mt-14 max-w-[560px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_0_rgba(31,26,20,0.04),0_20px_40px_-32px_rgba(31,26,20,0.18)]"
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-paper px-4 py-3.5">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-accent text-white font-serif italic font-medium text-[15px]">
          S
        </span>
        <span className="text-[13.5px] font-semibold">
          Sage
          <span className="ml-1.5 font-normal text-muted text-[12.5px]">· Our AI · trained on our playbooks</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-pos shadow-[0_0_0_3px_rgba(79,122,74,0.18)]" />
          Online
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-3 sm:px-4 pt-4 pb-4">
        {SAGE_STARTERS.map((s) => (
          <Link
            key={s.id}
            href={`/chat?q=${encodeURIComponent(s.q)}`}
            className="group inline-flex items-center justify-between rounded-[10px] border border-line bg-paper px-3.5 py-3 text-left text-[13px] sm:text-sm text-ink transition-colors hover:border-accent hover:bg-white"
          >
            <span>{s.label}</span>
            <Arrow className="text-muted transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-paper px-3.5 py-2.5 text-[11.5px] sm:text-[12.5px] text-dim whitespace-nowrap">
        <span aria-hidden className="block h-2 w-3.5 shrink-0 animate-[sb-pulse_2.4s_ease-in-out_infinite] rounded bg-gradient-to-r from-transparent via-accent to-transparent" />
        <span>Replies in ~5s · No commitment</span>
        <span className="ml-auto hidden sm:inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          <kbd className="rounded border border-line bg-white px-1.5 py-px font-mono text-[11px] text-ink-2">↵</kbd>
          to send
        </span>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// The Work — projects in AI envelope
// ──────────────────────────────────────────────────────────────────────

const PLATFORM_PILLS = [
  "Multi-tenant by design",
  "HIPAA & SOC2 ready",
  "Natural language workflows",
  "API-native architecture",
] as const;

function Work() {
  return (
    <Bay id="work" label="The work">
      <BayHead kicker="The Architecture" title={<>A chat-forward, <em className="not-italic"><span className="italic text-accent">API-native platform.</span></em></>}>
        Composable systems keep the focus on workflows and customer experience.
      </BayHead>

      <div className="relative rounded-[22px] border border-line bg-paper p-3.5 sm:p-6 md:p-9 shadow-[0_1px_0_rgba(31,26,20,0.04),0_30px_80px_-40px_rgba(200,84,46,0.18)]">
        {/* Corner brackets — envelope chrome */}
        <span aria-hidden className="absolute -top-px -left-px h-3.5 w-3.5 rounded-tl-[22px] border-t border-l border-accent/50" />
        <span aria-hidden className="absolute -bottom-px -right-px h-3.5 w-3.5 rounded-br-[22px] border-b border-r border-accent/50" />

        <div className="mb-3.5 sm:mb-[18px] flex flex-wrap items-center gap-2.5 sm:gap-3 border-b border-dashed border-line px-1 sm:px-2 pb-3.5 sm:pb-[18px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-2.5 py-[5px] font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
            <span className="inline-block h-1.5 w-1.5 animate-[sb-dot_2.4s_ease-in-out_infinite] rounded-full bg-accent shadow-[0_0_0_3px_rgba(200,84,46,0.2)]" />
            In Production
          </span>
          <span className="font-serif italic text-[14px] sm:text-[17px] leading-[1.4] text-ink-2">
            A look at the systems <em className="text-accent">currently running</em> on the platform.
          </span>
          <ul className="m-0 flex w-full list-none flex-wrap items-center gap-2 p-0">
            {PLATFORM_PILLS.map((label) => (
              <li
                key={label}
                className="inline-flex items-center whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:gap-3.5 md:grid-cols-2">
          {PROJECTS.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </div>
    </Bay>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={project.href}
      aria-label={`${project.name} — open product home`}
      className="group flex min-h-0 sm:min-h-[188px] flex-col gap-3.5 rounded-[14px] border border-line bg-[color-mix(in_oklab,white_70%,var(--color-paper))] p-5 sm:p-[26px_24px_22px] transition-[border-color,transform,box-shadow,background-color] hover:-translate-y-0.5 hover:border-accent hover:bg-white hover:shadow-[0_18px_36px_-28px_rgba(31,26,20,0.18)]"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-ink font-serif font-medium text-[15px] text-paper">
          {project.initial}
        </span>
        <span className="font-serif font-medium tracking-[-0.012em] text-[22px] sm:text-2xl leading-none text-ink">
          {project.name}
        </span>
      </div>

      <p className="m-0 font-serif italic text-[17px] sm:text-[19px] leading-[1.35] text-ink-2">
        {project.tagline}
      </p>

      <div className="mt-auto flex items-center justify-between border-t border-line pt-3.5 text-[12px] sm:text-[13px] text-muted">
        <span>{project.domain}</span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink transition-colors group-hover:text-accent">
          Visit <Arrow />
        </span>
      </div>
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────────────
// How I Work — operating principles for the studio
//
// Replaces the prior About() section. Four-card grid + serif closing
// line + capability pills. Single column under 960px (lg:grid-cols-2).
// Uses the terracotta accent throughout for visual continuity with the
// rest of the page; do not reintroduce the `pos` (green) token here.
// Source design: How I Work — Production.html.
// ──────────────────────────────────────────────────────────────────────

type Principle = {
  readonly id: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly body: string;
};

const PRINCIPLES: ReadonlyArray<Principle> = [
  {
    id: "business-case",
    icon: <TrendingUp size={22} strokeWidth={2} aria-hidden />,
    label: "Business case first.",
    body:
      "Every product starts with a business case: users, economics, and a clear path to value.",
  },
  {
    id: "operational",
    icon: <Layers size={22} strokeWidth={2} aria-hidden />,
    label: "Operationally disciplined.",
    body:
      "Products improve through measurement, customer feedback, and disciplined iteration.",
  },
  {
    id: "experience",
    icon: <Sparkles size={22} strokeWidth={2} aria-hidden />,
    label: "Build for adoption.",
    body:
      "Useful isn't enough. Software should feel easy, clear, and worth returning to.",
  },
  {
    id: "zone",
    icon: <ShieldCheck size={22} strokeWidth={2} aria-hidden />,
    label: "I know my zone.",
    body:
      "I know where I create leverage and where deeper expertise belongs.",
  },
] as const;

const CAPABILITY_PILLS = ["Customer-Driven", "Outcome-Focused", "Progress over Perfection"] as const;

function HowIWork() {
  return (
    <Bay id="how-i-work" label="How I work" tone="paper-2">
      <BayHead
        kicker="How I work"
        title={<span className="whitespace-normal sm:whitespace-nowrap">General manager. <em className="not-italic"><span className="italic text-accent">Product builder.</span></em></span>}
      >
        Products succeed when business reality, usability, and execution stay aligned.
      </BayHead>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        {PRINCIPLES.map((p) => (
          <article
            key={p.id}
            className="group flex h-full flex-col gap-4 sm:gap-5 rounded-2xl border border-line-2 bg-[color-mix(in_oklab,white_55%,var(--color-paper))] p-6 sm:p-8 transition-[border-color,background-color,box-shadow] hover:border-accent/50 hover:bg-white hover:shadow-[0_4px_16px_-8px_rgba(31,26,20,0.10)]"
          >
            <span
              aria-hidden
              className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl border border-accent/20 text-accent"
            >
              {p.icon}
            </span>
            <h3 className="m-0 font-serif font-semibold text-[20px] sm:text-[24px] leading-[1.2] tracking-[-0.012em] text-ink">
              {p.label}
            </h3>
            <p className="m-0 text-[14.5px] sm:text-[15px] leading-[1.55] text-muted text-pretty">
              {p.body}
            </p>
          </article>
        ))}
      </div>

      <p
        className="m-0 mt-7 sm:mt-10 max-w-[56ch] font-serif leading-[1.4] text-balance text-ink"
        style={{ fontSize: "clamp(18px, 1.8vw, 22px)" }}
      >
        Building useful software means listening closely, iterating quickly, and focusing on outcomes.
      </p>

      <div className="mt-5 sm:mt-8 flex justify-start sm:justify-end">
        <ul className="m-0 flex list-none flex-wrap justify-start sm:justify-end gap-2 p-0">
          {CAPABILITY_PILLS.map((label) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-accent/40 bg-accent-soft px-3.5 py-2 font-sans text-[13px] font-medium tracking-[-0.005em] text-ink"
            >
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </Bay>
  );
}

// ──────────────────────────────────────────────────────────────────────
// How it works — three-step process for the C$250 working session.
// Replaces the prior Stack section. Reuses the Bay / Arrow primitives and
// the SBL terracotta tokens (accent / accent-deep / accent-soft).
// ──────────────────────────────────────────────────────────────────────

// Bookable session URL — placeholder until the real Calendly link is wired.
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

function HowItWorks() {
  return (
    <Bay id="how-it-works" label="How it works">
      {/* Eyebrow row: kicker pill + horizontal rule. */}
      <div className="mb-6 sm:mb-10 flex items-center gap-4">
        <span className="inline-block rounded-[3px] bg-accent/15 px-2 py-0.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.22em] text-ink">
          Helping build great products
        </span>
        <span aria-hidden className="hidden sm:block h-px max-w-[180px] flex-1 bg-ink/10" />
      </div>

      {/* Section header */}
      <header className="mb-10 sm:mb-14">
        <h2
          id="how-it-works-h"
          className="m-0 mb-[18px] font-serif font-normal leading-[1.04] tracking-[-0.02em] text-ink text-balance"
          style={{ fontSize: "clamp(34px, 4.2vw, 56px)" }}
        >
          Want help with your{" "}
          <em className="italic text-accent font-normal">product?</em>
        </h2>
        <p
          className="m-0 font-sans leading-[1.55] text-ink-2 text-pretty"
          style={{ fontSize: "clamp(16px, 1.8vw, 18px)" }}
        >
          My background in coaching, revenue leadership, and general management helps uncover product
          risks and opportunities others often miss — especially around economics, retention, and growth.
          <br />
          If you want to explore your product, book time below.
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
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
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

function StepCard({ step }: { step: Step }) {
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
          className="mt-auto group/cta inline-flex items-center gap-2.5 self-start whitespace-nowrap rounded-full bg-accent px-[18px] py-3 font-sans text-[14px] font-semibold leading-none text-white transition-colors hover:bg-accent-deep"
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
// Footer
// ──────────────────────────────────────────────────────────────────────

function SiteFooter() {
  return (
    <footer className="bg-ink py-12 pt-16 pb-9 text-paper">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:px-12">
        <div className="mb-9 sm:mb-14 grid grid-cols-2 gap-7 sm:gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <p className="m-0 mb-3.5 font-serif text-[24px] sm:text-[28px] tracking-[-0.005em] text-paper">
              Second Brain <em className="font-normal italic text-accent-soft">Labs</em>
            </p>
            <p className="m-0 max-w-[36ch] text-sm leading-[1.5] text-paper/70">
              A small workshop building AI products for humans — operators, families, caregivers, the people doing the actual work.
            </p>
          </div>
          <FooterCol heading="Products" links={[
            { label: "Sage", href: "/sage" },
            { label: "Heirloom", href: "/heirloom" },
            { label: "HUGS", href: "/hugs" },
            { label: "MealFlow", href: "/mealflow" },
          ]} />
          <FooterCol heading="Studio" links={[
            { label: "About", href: "#how-i-work" },
            { label: "How it works", href: "#how-it-works" },
            { label: "Writing", href: "/writing" },
          ]} />
          <FooterCol heading="Contact" links={[
            { label: "hello@secondbrain.labs", href: "mailto:hello@secondbrain.labs" },
            { label: "San Francisco · Remote", href: "#" },
            { label: "LinkedIn ↗", href: "#" },
          ]} />
        </div>
        <div className="flex flex-col items-start justify-between gap-2.5 border-t border-paper/20 pt-7 text-[12.5px] text-paper/55 sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Second Brain Labs, Inc.</span>
          <span className="font-serif italic text-paper/80">Trying the impossible, one product at a time.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, links }: { heading: string; links: ReadonlyArray<{ label: string; href: string }> }) {
  return (
    <div>
      <h5 className="m-0 mb-4 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-paper/55">{heading}</h5>
      <div className="flex flex-col gap-2.5 text-sm">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="text-paper/80 transition-colors hover:text-paper">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Section primitives
// ──────────────────────────────────────────────────────────────────────

type BayProps = {
  id?: string;
  label?: string;
  tone?: "paper" | "paper-2";
  children: ReactNode;
};

function Bay({ id, label, tone = "paper", children }: BayProps) {
  return (
    <section
      id={id}
      data-screen-label={label}
      className={`border-t border-line py-14 sm:py-20 md:py-28 lg:py-32 ${tone === "paper-2" ? "bg-paper-2" : "bg-paper"}`}
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:px-12">{children}</div>
    </section>
  );
}

function BayHead({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-7 sm:mb-11 md:mb-14">
      <Kicker>{kicker}</Kicker>
      <BayTitle>{title}</BayTitle>
      {children ? (
        <p className="m-0 text-[16px] sm:text-[17px] leading-[1.55] text-ink-2 text-pretty">{children}</p>
      ) : null}
    </header>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 inline-flex items-center gap-2.5 font-sans text-[11.5px] font-semibold uppercase tracking-[0.16em] text-accent">
      <span aria-hidden className="block h-px w-[22px] bg-current opacity-60" />
      {children}
    </div>
  );
}

function BayTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="m-0 mb-4 font-serif font-normal leading-[1.06] tracking-[-0.014em] text-balance text-ink"
      style={{ fontSize: "clamp(30px, 4vw, 52px)" }}
    >
      {children}
    </h2>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Button primitives
// ──────────────────────────────────────────────────────────────────────

function BtnPrimary({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-ink bg-ink px-3.5 sm:px-[18px] py-2.5 text-[13px] sm:text-sm font-medium leading-none text-paper transition-colors hover:border-accent hover:bg-accent"
    >
      {children}
    </Link>
  );
}

function BtnGhost({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-transparent px-3.5 sm:px-[18px] py-2.5 text-[13px] sm:text-sm font-medium leading-none text-muted transition-colors hover:text-ink"
    >
      {children}
    </Link>
  );
}

function Arrow({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block transition-transform group-hover:translate-x-0.5 ${className}`}>
      →
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Icons (inline, dependency-free)
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
