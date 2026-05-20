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
  { id: "sage",     name: "Sage",     initial: "S", tagline: "Engine for SMBs.",          href: "/sage",     domain: "sage.secondbrain.labs" },
  { id: "heirloom", name: "Heirloom", initial: "H", tagline: "Memory recording.",         href: "/heirloom", domain: "heirloom.secondbrain.labs" },
  { id: "hugs",     name: "HUGS",     initial: "H", tagline: "Family building & support.", href: "/hugs",     domain: "hugs.secondbrain.labs" },
  { id: "mealflow", name: "MealFlow", initial: "M", tagline: "Nutrition platform.",       href: "/mealflow", domain: "mealflow.secondbrain.labs" },
] as const;

type SageStarter = { readonly id: string; readonly label: string; readonly q: string };

const SAGE_STARTERS: ReadonlyArray<SageStarter> = [
  { id: "work",     label: "What are you working on right now?", q: "What are you working on right now?" },
  { id: "fit",      label: "Which product fits my problem?",     q: "Which product fits my problem?" },
  { id: "team",     label: "Who's behind Second Brain Labs?",    q: "Who's behind Second Brain Labs?" },
  { id: "partner",  label: "Can we partner on something new?",   q: "Can we partner on something new?" },
] as const;

type AboutPoint = { readonly icon: ReactNode; readonly body: ReactNode };

const OPERATOR_POINTS: ReadonlyArray<AboutPoint> = [
  { icon: <IconTarget />,    body: <><b className="text-ink font-semibold">15+ years</b> shipping software across consumer, health, and SMB tooling.</> },
  { icon: <IconChartUp />,   body: <><b className="text-ink font-semibold">Operator first,</b> engineer second — comfortable in the spreadsheet and the repo.</> },
  { icon: <IconTriangle />,  body: <>Believes the next decade of software will be built by <b className="text-ink font-semibold">small, weird, agentic teams.</b></> },
  { icon: <IconGlobe />,     body: <>Writes occasionally. Reads <b className="text-ink font-semibold">obsessively.</b> Available for coffee.</> },
];

const WORKSHOP_POINTS: ReadonlyArray<AboutPoint> = [
  { icon: <IconGrid />,      body: <><b className="text-ink font-semibold">Four products,</b> one envelope — shared infra, shared evals, shared voice.</> },
  { icon: <IconCheck />,     body: <><b className="text-ink font-semibold">Outcomes over outputs.</b> A metric on day one, on the wall by Friday.</> },
  { icon: <IconStar />,      body: <>Bias toward <b className="text-ink font-semibold">building in public</b> and shipping the unfashionable thing.</> },
  { icon: <IconPerson />,    body: <>Built for <b className="text-ink font-semibold">humans</b> — operators, families, caregivers, the people doing the actual work.</> },
];

type StackItem = { readonly layer: string; readonly name: ReactNode; readonly note: ReactNode };

const STACK: ReadonlyArray<StackItem> = [
  { layer: "App · 01",         name: <>Next.js <em className="text-accent not-italic font-medium">15</em></>,    note: "App Router on Vercel." },
  { layer: "UI · 02",          name: <>React <em className="text-accent not-italic font-medium">19</em></>,      note: "Server components, suspense, the works." },
  { layer: "Language · 03",    name: <>TypeScript</>,                                                            note: <><em className="text-accent not-italic font-medium">Strict</em> mode, everywhere.</> },
  { layer: "Admin UI · 04",    name: <>Mantine <em className="text-accent not-italic font-medium">v7</em></>,    note: "For internal tooling and admin." },
  { layer: "Public site · 05", name: <>Tailwind</>,                                                              note: "Marketing surfaces and product chrome." },
  { layer: "Data · 06",        name: <>Supabase</>,                                                              note: "Postgres, auth, storage, realtime." },
  { layer: "Auth · 07",        name: <>Clerk</>,                                                                 note: "Admin route protection only." },
  { layer: "Models · 08",      name: <>Anthropic <em className="text-accent not-italic font-medium">API</em></>, note: "The brains of the envelope." },
];

// ──────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="bg-paper text-ink font-sans antialiased selection:bg-accent-soft selection:text-ink">
      <Nav />
      <Hero />
      <Work />
      <About />
      <Stack />
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
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.012em] whitespace-nowrap">
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-ink">
            {/* TODO: replace with <Image /> when logo asset is in /public */}
            <img src="/logo.png" alt="" className="h-full w-full object-cover" />
          </span>
          <span className="hidden sm:inline">Second Brain Labs</span>
        </Link>
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
          className="m-0 mb-7 max-w-[14ch] font-serif font-normal leading-[1.02] tracking-[-0.022em] text-balance text-ink"
          style={{ fontSize: "clamp(38px, 7.2vw, 104px)" }}
        >
          Building products for <em className="font-normal italic text-accent">humanity.</em>
        </h1>
        <p
          className="m-0 mb-7 sm:mb-11 max-w-[32ch] font-serif italic font-normal leading-[1.35] text-ink-2 text-pretty"
          style={{ fontSize: "clamp(20px, 2.6vw, 30px)" }}
        >
          A workshop for trying the impossible.
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
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
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
        <span className="ml-auto hidden sm:inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
          <kbd className="rounded border border-line bg-white px-1.5 py-px font-mono text-[10.5px] text-ink-2">↵</kbd>
          to send
        </span>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// The Work — projects in AI envelope
// ──────────────────────────────────────────────────────────────────────

function Work() {
  return (
    <Bay id="work" label="The work">
      <BayHead kicker="The work" title={<>Four products. <em className="not-italic"><span className="italic text-accent">One quiet engine.</span></em></>}>
        Everything we build sits inside the same AI envelope — shared models, shared memory, shared playbooks. Each product
        is a different shape carved out of the same material.
      </BayHead>

      <div className="relative rounded-[22px] border border-line bg-paper p-3.5 sm:p-6 md:p-9 shadow-[0_1px_0_rgba(31,26,20,0.04),0_30px_80px_-40px_rgba(200,84,46,0.18)]">
        {/* Corner brackets — envelope chrome */}
        <span aria-hidden className="absolute -top-px -left-px h-3.5 w-3.5 rounded-tl-[22px] border-t border-l border-accent/50" />
        <span aria-hidden className="absolute -bottom-px -right-px h-3.5 w-3.5 rounded-br-[22px] border-b border-r border-accent/50" />

        <div className="mb-3.5 sm:mb-[18px] flex flex-wrap items-center gap-2.5 sm:gap-3 border-b border-dashed border-line px-1 sm:px-2 pb-3.5 sm:pb-[18px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-2.5 py-[5px] font-mono text-[10.5px] uppercase tracking-[0.16em] text-accent">
            <span className="inline-block h-1.5 w-1.5 animate-[sb-dot_2.4s_ease-in-out_infinite] rounded-full bg-accent shadow-[0_0_0_3px_rgba(200,84,46,0.2)]" />
            AI envelope · live
          </span>
          <span className="font-serif italic text-[14px] sm:text-[17px] leading-[1.4] text-ink-2">
            Anthropic models, our playbooks, <em className="text-accent">your context.</em>
          </span>
          <span className="ml-auto hidden md:inline font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted whitespace-nowrap">
            04 / 04 running
          </span>
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
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-accent">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full bg-accent" />
          AI · core
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
// About — operator + workshop
// ──────────────────────────────────────────────────────────────────────

function About() {
  return (
    <Bay id="about" label="About" tone="paper-2">
      <BayHead kicker="About" title={<>One operator. <em className="not-italic"><span className="italic text-accent">One workshop.</span></em></>} />

      <div className="grid grid-cols-1 gap-x-12 gap-y-14 md:grid-cols-2 md:gap-12">
        <AboutColumn
          portraitLabel="Portrait · placeholder"
          heading={<>The <em className="not-italic"><span className="italic text-accent">operator</span></em></>}
          role="Founder · 2BL"
          points={OPERATOR_POINTS}
        />
        <AboutColumn
          portraitLabel="Workshop · placeholder"
          heading={<>The <em className="not-italic"><span className="italic text-accent">workshop</span></em></>}
          role="Studio · Second Brain Labs"
          points={WORKSHOP_POINTS}
        />
      </div>
    </Bay>
  );
}

type AboutColumnProps = {
  portraitLabel: string;
  heading: ReactNode;
  role: string;
  points: ReadonlyArray<AboutPoint>;
};

function AboutColumn({ portraitLabel, heading, role, points }: AboutColumnProps) {
  return (
    <div>
      {/* TODO: replace placeholder with real <Image /> when art is ready */}
      <div
        aria-hidden
        className="mb-5 grid aspect-[4/5] w-full max-w-[180px] sm:max-w-[240px] place-items-center rounded-xl border border-line font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted bg-[repeating-linear-gradient(135deg,var(--color-paper-3)_0px,var(--color-paper-3)_8px,var(--color-paper-2)_8px,var(--color-paper-2)_16px)]"
      >
        {portraitLabel}
      </div>
      <h3 className="m-0 mb-2 font-serif font-medium text-[24px] sm:text-[28px] tracking-[-0.01em] text-ink">
        {heading}
      </h3>
      <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{role}</div>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {points.map((p, i) => (
          <li key={i} className="grid grid-cols-[28px_1fr] items-start gap-3.5 text-[14.5px] sm:text-[15px] leading-[1.5] text-ink-2">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-[7px] border border-line bg-paper text-accent">
              {p.icon}
            </span>
            <span>{p.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Stack
// ──────────────────────────────────────────────────────────────────────

function Stack() {
  return (
    <Bay id="stack" label="Stack">
      <div className="mb-7 sm:mb-11 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Kicker>The stack</Kicker>
          <BayTitle>What it's <em className="not-italic"><span className="italic text-accent">made of.</span></em></BayTitle>
        </div>
        <p className="m-0 max-w-[42ch] text-[16px] sm:text-[17px] leading-[1.55] text-ink-2 text-pretty">
          A boring, modern, opinionated stack — chosen so the work compounds across every product in the envelope.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STACK.map((s, i) => (
          <div key={i} className="flex min-h-0 sm:min-h-[120px] flex-col gap-1 bg-paper p-5 sm:p-[22px_20px]">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">{s.layer}</div>
            <div className="font-serif font-medium text-[20px] sm:text-[22px] tracking-[-0.008em] leading-[1.1] text-ink">
              {s.name}
            </div>
            <div className="mt-0.5 text-[13px] leading-[1.4] text-muted">{s.note}</div>
          </div>
        ))}
      </div>
    </Bay>
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
            { label: "About", href: "#about" },
            { label: "Stack", href: "#stack" },
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
    <header className="mb-7 sm:mb-11 md:mb-14 max-w-[720px]">
      <Kicker>{kicker}</Kicker>
      <BayTitle>{title}</BayTitle>
      {children ? (
        <p className="m-0 max-w-[56ch] text-[16px] sm:text-[17px] leading-[1.55] text-ink-2 text-pretty">{children}</p>
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
      style={{ fontSize: "clamp(28px, 4.2vw, 52px)" }}
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

function IconTarget() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="5" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}
function IconChartUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12 L6 6 L9 9 L14 3" />
      <path d="M10 3 H14 V7" />
    </svg>
  );
}
function IconTriangle() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 13 L8 3 L13 13 Z" />
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8 H14" />
      <path d="M8 2 C10 5 10 11 8 14" />
      <path d="M8 2 C6 5 6 11 8 14" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M2.5 6.5 H13.5" />
      <path d="M6.5 2.5 V13.5" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8 L7 12 L13 4" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2 V14" />
      <path d="M3 8 H13" />
      <path d="M5 5 L11 11" />
      <path d="M11 5 L5 11" />
    </svg>
  );
}
function IconPerson() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12 C3 8 5 6 8 6 C11 6 13 8 13 12" />
      <circle cx="8" cy="4" r="1.6" />
    </svg>
  );
}
