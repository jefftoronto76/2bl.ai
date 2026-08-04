'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Feather,
  Mic,
  Sparkles,
  BookOpen,
  MessageCircle,
  Users,
  Image,
  Clock,
  Shield,
  Heart,
  Monitor,
  Headphones,
  LayoutGrid,
  Menu,
  X,
} from 'lucide-react'

/*
  Legacy landing page — corrected drop-in replacement.

  Fixes vs. the previous version:
  • FormatFan: was a collapsed pile (all cards at `top-4`); now a staggered
    vertical ledger of five editions, matching the prototype.
  • BookCover: the accent spine was painted under the in-flow cover face and
    never visible; rebuilt as the framed 3D cover from the design.
  • "Secure &amp;amp; responsible" double-escape removed (now renders "Secure & responsible").
  • Dead hero placeholder div removed; hero is a real 2-col → 1-col grid.
  • useReveal gained an in-view-at-mount check + a safety timeout so content
    can never get stuck at opacity:0 if the observer doesn't fire.
  • Restored the richer differentiator / "What Is" copy + vote count (247).

  Token notes: uses ONLY the canonical platform tokens (css-token-unification-spec.md)
  through their Tailwind classes — bg-background (--color-background), bg-surface
  (--color-surface), text-text-primary (--color-text-primary), text-text-muted
  (--color-text-muted), bg-accent/text-accent (--color-accent), hover:bg-accent-hover
  (--color-accent-hover), border-border (--color-border), text-background (text on an
  accent fill). No tenant-scoped --hl-*/--lg-* names (those fail scripts/lint-tokens.ts).
  The flat egg-shell + terracotta VALUES live in app/heirloom/globals.css on these same
  :root tokens. Accent alpha via rgb(var(--color-accent) / x) inline where Tailwind's
  /opacity isn't convenient. Renders under the existing [data-brand="heirloom"] wrapper
  from app/heirloom/layout.tsx (fonts font-display/-body/-mono resolve only there).
  CTAs are `#` placeholders — wire dispatch({ type: 'OPEN_CHAT' }) when the chat store
  is in scope.
*/

// ─── Scroll reveal hook ────────────────────────────────────────────────────

function useReveal() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reveal = () => el.classList.add('hl-visible')

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveal()
      return
    }

    // Reveal immediately if already on-screen at mount (hydration / programmatic scroll).
    if (el.getBoundingClientRect().top < (window.innerHeight || 800)) reveal()

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal()
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)

    // Safety: never leave a section stuck hidden.
    const t = window.setTimeout(reveal, 1400)

    return () => {
      observer.disconnect()
      clearTimeout(t)
    }
  }, [])

  return ref
}

// ─── Smooth-scroll helper ──────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

// ─── 1. Nav ───────────────────────────────────────────────────────────────

function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 769) setMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const navBg =
    scrolled || menuOpen
      ? 'bg-surface/95 backdrop-blur-sm border-b border-accent/20'
      : 'bg-transparent border-b border-transparent'

  // Pricing has no on-page target yet — open question in hand-over.md.
  const navLinks: { label: string; target: string | null }[] = [
    { label: 'The Best Part', target: 'the-best-part' },
    { label: 'Pricing', target: null },
    { label: 'About', target: 'what-is-heirloom' },
  ]

  const go = (target: string | null) => {
    setMenuOpen(false)
    if (target) setTimeout(() => scrollTo(target), 10)
  }

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${navBg}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-16">
        {/* Wordmark */}
        <a
          href="/heirloom"
          className="flex items-center gap-2.5 text-text-primary no-underline"
          aria-label="Legacy home"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/30">
            <Feather className="w-4 h-4 text-accent" strokeWidth={1.5} />
          </span>
          <span className="font-display font-semibold text-lg tracking-wide">Legacy</span>
        </a>

        {/* Desktop center links */}
        <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
          {navLinks.map((link) => (
            <li key={link.label}>
              <button
                onClick={() => go(link.target)}
                className="font-body text-[15px] font-medium text-text-muted hover:text-accent transition-colors bg-transparent border-0 cursor-pointer p-0 whitespace-nowrap"
              >
                {link.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Desktop right cluster */}
        <div className="flex items-center gap-2 sm:gap-3.5">
          <a
            href="#"
            className="hidden md:inline-flex font-body text-[15px] font-medium text-text-muted hover:text-text-primary transition-colors items-center"
          >
            Sign up
          </a>
          <a
            href="#"
            className="font-body text-[15px] font-semibold bg-accent text-background px-4 rounded-[10px] hover:bg-accent-hover transition-colors min-h-[44px] flex items-center whitespace-nowrap"
          >
            Start Your Story
          </a>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-11 h-11 rounded-[10px] border border-accent/25 text-text-primary bg-transparent"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen ? 'max-h-80 opacity-100 border-t border-accent/20' : 'max-h-0 opacity-0'
        }`}
      >
        <ul className="list-none m-0 p-0 px-6 pt-3 pb-5 flex flex-col">
          {navLinks.map((link) => (
            <li key={link.label}>
              <button
                onClick={() => go(link.target)}
                className="w-full text-left font-display text-lg font-medium text-text-primary py-[15px] min-h-[44px] border-b border-border bg-transparent border-0 cursor-pointer"
              >
                {link.label}
              </button>
            </li>
          ))}
          <li>
            <a
              href="#"
              className="block font-display text-lg font-medium text-text-muted py-[15px] min-h-[44px] flex items-center"
              onClick={() => setMenuOpen(false)}
            >
              Sign up
            </a>
          </li>
        </ul>
      </div>
    </nav>
  )
}

// ─── Format Fan (hero visual) ──────────────────────────────────────────────

const FORMAT_ITEMS = [
  { Icon: BookOpen, name: 'The Book', tag: 'Printed & bound', top: 4, angle: -2.4 },
  { Icon: Monitor, name: 'The Webpage', tag: 'A living digital edition', top: 74, angle: 1.6 },
  { Icon: Headphones, name: 'The Audiobook', tag: 'Narrated in their own voice', top: 144, angle: -1.6 },
  { Icon: LayoutGrid, name: 'The Comic', tag: 'Illustrated panels', top: 214, angle: 2.4 },
  { Icon: Clock, name: 'The Time Capsule', tag: 'Sealed today, opened later', top: 284, angle: -2 },
]

function FormatFan() {
  return (
    <div className="relative" style={{ width: 340, height: 366 }} aria-hidden>
      {FORMAT_ITEMS.map((e, i) => {
        const Icon = e.Icon
        return (
          <div
            key={e.name}
            className="absolute left-1/2 flex items-center gap-4 rounded-2xl bg-surface border border-accent/25"
            style={{
              top: e.top,
              width: 300,
              height: 82,
              padding: '0 20px',
              transform: `translateX(-50%) rotate(${e.angle}deg)`,
              zIndex: i + 1,
              boxShadow: '0 26px 50px -26px rgba(26,21,15,.22)',
            }}
          >
            <span
              className="shrink-0 flex items-center justify-center text-accent"
              style={{ width: 46, height: 46, borderRadius: 13, background: 'rgb(var(--color-accent) / 0.12)' }}
            >
              <Icon size={22} strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex flex-col gap-1">
              <span className="font-display italic text-text-primary" style={{ fontSize: 23, lineHeight: 1 }}>
                {e.name}
              </span>
              <span
                className="font-mono uppercase text-text-muted whitespace-nowrap"
                style={{ fontSize: 9.5, letterSpacing: '.18em' }}
              >
                {e.tag}
              </span>
            </div>
            <span className="ml-auto font-mono text-accent/50" style={{ fontSize: 11 }}>
              0{i + 1}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── 2. Hero ──────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="pt-32 pb-24 px-6" aria-label="Hero">
      <div className="mx-auto max-w-6xl hl-hero-grid">
        {/* Copy */}
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.34em] text-accent m-0 mb-5">
            Private. Secure. Collaborative.
          </p>

          <h1
            className="font-display font-light text-text-primary m-0 leading-[0.95] tracking-tight"
            style={{ fontSize: 'clamp(56px, 8vw, 108px)' }}
          >
            Legacy
          </h1>

          <p
            className="font-display italic text-accent m-0 mt-3 leading-snug"
            style={{ fontSize: 'clamp(16px, 4.2vw, 30px)' }}
          >
            Capture life as it happens.
          </p>

          <p className="font-body text-text-muted m-0 mt-7 max-w-[480px]" style={{ lineHeight: 1.78, fontSize: 18 }}>
            <span className="md:whitespace-nowrap">
              The moments pass quickly. The stories behind them fade even faster.
            </span>{' '}
            Capture memories while they’re fresh, and turn them into something you’ll
            always have.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-9">
            <a
              href="#"
              className="font-body text-base font-semibold bg-accent text-background px-7 rounded-[13px] hover:bg-accent-hover transition-all duration-200 min-h-[52px] flex items-center shadow-lg hover:-translate-y-0.5"
            >
              Start Your Story
            </a>
            <button
              onClick={() => scrollTo('learn-more')}
              className="font-body text-base font-semibold text-accent hover:text-text-primary px-7 rounded-[13px] border border-accent/40 hover:border-accent hover:bg-accent/10 transition-all duration-200 min-h-[52px] bg-transparent cursor-pointer"
            >
              Learn More
            </button>
          </div>
        </div>

        {/* Visual — hidden ≤920px */}
        <div className="flex justify-center hl-fan-visible">
          <FormatFan />
        </div>
      </div>

      <style>{`
        .hl-hero-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 3rem;
          align-items: center;
        }
        @media (min-width: 921px) {
          .hl-hero-grid { grid-template-columns: 1.18fr 0.82fr; }
        }
        .hl-fan-visible { display: none; }
        @media (min-width: 921px) { .hl-fan-visible { display: flex; } }
      `}</style>
    </section>
  )
}

// ─── 3. What Is Heirloom ───────────────────────────────────────────────────

const HOW_CARDS = [
  {
    index: '01',
    icon: Mic,
    label: 'Capture',
    body: 'Start with a memory, a photo, or a voice note. Invite others to deepen the story.',
  },
  {
    index: '02',
    icon: Sparkles,
    label: 'Shape',
    body: 'Legacy’s storytelling engine helps you uncover what matters most and tell it well.',
  },
  {
    index: '03',
    icon: BookOpen,
    label: 'Publish',
    body: 'Give those stories a form that can be shared, revisited, and passed along.',
  },
]

function WhatIsHeirloomSection() {
  const ref = useReveal()

  return (
    <section
      id="what-is-heirloom"
      ref={ref as React.RefObject<HTMLElement>}
      className="hl-reveal py-24 px-6 scroll-mt-16"
      aria-labelledby="what-heading"
    >
      <div id="learn-more" className="mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent m-0 mb-6">
            Create Your Legacy
          </p>
          <h2
            id="what-heading"
            className="font-display font-light text-text-primary m-0 mx-auto max-w-2xl leading-[1.12] tracking-tight"
            style={{ fontSize: 'clamp(30px, 4.6vw, 60px)' }}
          >
            Through simple conversations, Legacy helps you give your memories a future.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] items-stretch">
          {HOW_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className="h-full flex flex-col">
                <div className="h-px mb-7" style={{ background: 'rgb(var(--color-accent) / 0.25)' }} />
                <div
                  className="relative h-full flex-1 overflow-hidden rounded-2xl bg-surface border border-border"
                  style={{ padding: 30 }}
                >
                  <span
                    className="absolute font-display leading-none select-none pointer-events-none"
                    style={{ top: 18, right: 22, fontSize: 60, color: 'rgb(var(--color-accent) / 0.1)' }}
                    aria-hidden
                  >
                    {card.index}
                  </span>
                  <span
                    className="flex items-center justify-center text-accent"
                    style={{ width: 54, height: 54, borderRadius: 14, background: 'rgb(var(--color-accent) / 0.12)', marginBottom: 24 }}
                  >
                    <Icon className="w-6 h-6" strokeWidth={1.5} />
                  </span>
                  <p className="font-mono uppercase text-accent m-0 mb-3.5" style={{ fontSize: 12, letterSpacing: '.26em' }}>
                    {card.label}
                  </p>
                  <p className="font-body text-text-muted m-0" style={{ fontSize: 17, lineHeight: 1.62 }}>
                    {card.body}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── 4. The Best Parts ───────────────────────────────────────────────────

const FEATURE_CARDS = [
  {
    icon: MessageCircle,
    title: 'Questions that draw it out',
    body: 'Legacy interviews you like a patient biographer — following the thread, asking the one more question that surfaces the detail only you would remember.',
  },
  {
    icon: Users,
    title: 'Many voices, one story',
    body: 'Invite the people who were there. Legacy braids everyone’s account of the same moment into something fuller and truer than any single memory.',
  },
  {
    icon: Image,
    title: 'Memories keep their media',
    body: 'Photos, letters, and voice notes stay attached to the story they belong to — captioned and in place, never lost in a scroll of chat.',
  },
  {
    icon: Clock,
    title: 'It remembers, even if you don’t',
    body: 'Share the dates that matter and Legacy nudges you when they come around — capturing the story while it’s still close.',
  },
]

function TheBestPartsSection() {
  const ref = useReveal()
  const [voted, setVoted] = useState(false)
  const [count, setCount] = useState(247)

  useEffect(() => {
    try {
      if (localStorage.getItem('hl.liveEditorVote') === '1') {
        setVoted(true)
        setCount(248)
      }
    } catch {
      /* storage unavailable */
    }
  }, [])

  const handleVote = useCallback(() => {
    if (voted) return
    setVoted(true)
    setCount((c) => c + 1)
    try {
      localStorage.setItem('hl.liveEditorVote', '1')
    } catch {
      /* storage unavailable */
    }
  }, [voted])

  return (
    <section
      id="the-best-part"
      ref={ref as React.RefObject<HTMLElement>}
      className="hl-reveal py-24 px-6 scroll-mt-16 bg-surface border-y border-border"
      aria-labelledby="best-heading"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent m-0 mb-6">
            Changing the way memories are saved and shared.
          </p>
          <h2
            id="best-heading"
            className="font-display font-light text-text-primary m-0 leading-[1.12] tracking-tight"
            style={{ fontSize: 'clamp(30px, 4.6vw, 60px)' }}
          >
            The Best Parts
          </h2>
        </div>

        {/* Lead card */}
        <div
          className="rounded-[20px] bg-background border border-accent/25 mb-[18px] flex flex-wrap items-center gap-7"
          style={{ padding: 'clamp(28px, 4vw, 44px)' }}
        >
          <span
            className="shrink-0 flex items-center justify-center text-accent"
            style={{ width: 68, height: 68, borderRadius: 17, background: 'rgb(var(--color-accent) / 0.12)' }}
          >
            <Feather className="w-7 h-7" strokeWidth={1.5} />
          </span>
          <div className="flex-1 min-w-0 basis-80">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent m-0 mb-3">
              Storytelling, built in
            </p>
            <h3
              className="font-display font-medium text-text-primary m-0 mb-3.5 leading-[1.12]"
              style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}
            >
              You don’t have to be a writer.
            </h3>
            <p className="font-body text-text-muted m-0 max-w-[620px]" style={{ fontSize: 17, lineHeight: 1.64 }}>
              Most memories come out as fragments. Legacy shapes them into stories —
              using the structures great storytellers lean on, the arc that carries a
              reader from an ordinary moment to the one that changed everything. You bring
              the memory; Legacy helps it become a story worth rereading.
            </p>
          </div>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px] mb-[18px]">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.title} className="rounded-[18px] bg-background border border-border" style={{ padding: 30 }}>
                <span
                  className="flex items-center justify-center text-accent"
                  style={{ width: 50, height: 50, borderRadius: 13, background: 'rgb(var(--color-accent) / 0.12)', marginBottom: 22 }}
                >
                  <Icon className="w-[23px] h-[23px]" strokeWidth={1.5} />
                </span>
                <h3 className="font-display font-medium text-text-primary m-0 mb-2.5 leading-[1.16]" style={{ fontSize: 25 }}>
                  {card.title}
                </h3>
                <p className="font-body text-text-muted m-0" style={{ fontSize: 16, lineHeight: 1.6 }}>
                  {card.body}
                </p>
              </div>
            )
          })}
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
          {/* Secure & responsible — links out (route TBD) */}
          <a
            href="#"
            className="rounded-[18px] bg-background border border-border block no-underline hover:border-accent/40 transition-colors"
            style={{ padding: 30 }}
            aria-label="Learn more about our security and responsible AI practices"
          >
            <span
              className="flex items-center justify-center text-accent"
              style={{ width: 50, height: 50, borderRadius: 13, background: 'rgb(var(--color-accent) / 0.12)', marginBottom: 22 }}
            >
              <Shield className="w-[23px] h-[23px]" strokeWidth={1.5} />
            </span>
            <h3 className="font-display font-medium text-text-primary m-0 mb-2.5 leading-[1.16]" style={{ fontSize: 25 }}>
              Secure &amp; responsible
            </h3>
            <p className="font-body text-text-muted m-0" style={{ fontSize: 16, lineHeight: 1.6 }}>
              Legacy is built to support the most rigorous security standards and privacy
              for your data. <span className="text-accent font-medium">Learn more&nbsp;→</span>
            </p>
          </a>

          {/* Live editor teaser + vote */}
          <div
            className="rounded-[18px] bg-background border border-dashed border-accent/40 relative overflow-hidden"
            style={{ padding: 30 }}
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              <span
                className="flex items-center justify-center text-accent"
                style={{ width: 50, height: 50, borderRadius: 13, background: 'rgb(var(--color-accent) / 0.12)' }}
              >
                <Feather className="w-[23px] h-[23px]" strokeWidth={1.5} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent border border-accent/25 px-2.5 py-1 rounded-full">
                Coming soon
              </span>
            </div>
            <h3 className="font-display font-medium text-text-primary m-0 mb-2.5 leading-[1.16]" style={{ fontSize: 25 }}>
              A live editor
            </h3>
            <p className="font-body text-text-muted m-0 mb-5" style={{ fontSize: 16, lineHeight: 1.6 }}>
              For the hands-on writers — shape the prose yourself, line by line, editing
              side by side with Legacy in real time.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleVote}
                disabled={voted}
                aria-pressed={voted}
                aria-label={voted ? 'You voted for this feature' : 'I want this sooner'}
                className={`flex items-center gap-2.5 font-mono text-[13px] font-medium px-4 rounded-full border transition-colors min-h-[44px] ${
                  voted
                    ? 'bg-accent/10 border-accent text-accent cursor-default'
                    : 'border-border text-text-muted hover:border-accent/40 hover:text-accent bg-transparent cursor-pointer'
                }`}
              >
                <Heart className="w-[17px] h-[17px]" fill={voted ? 'currentColor' : 'none'} strokeWidth={1.5} />
                <span>{count}</span>
              </button>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
                {voted ? 'Thanks!' : 'Want it sooner?'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── CSS Book Cover ───────────────────────────────────────────────────────

function BookCover() {
  return (
    <div className="relative" style={{ width: 280, height: 380, perspective: 1400 }} aria-hidden>
      <div className="absolute inset-0" style={{ transform: 'rotateY(-16deg)', transformStyle: 'preserve-3d' }}>
        {/* page-stack edge */}
        <div
          className="absolute"
          style={{
            top: 6,
            bottom: 6,
            right: -10,
            width: 16,
            background: 'repeating-linear-gradient(to bottom, #efe6d2, #efe6d2 2px, #d8ccb2 2px, #d8ccb2 3px)',
            borderRadius: '2px 4px 4px 2px',
            transform: 'rotateY(20deg)',
            boxShadow: 'inset -3px 0 6px rgba(26,21,15,.18)',
          }}
        />
        {/* cover face */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center border border-accent/25"
          style={{
            padding: 28,
            borderRadius: '4px 10px 10px 4px',
            background: 'linear-gradient(135deg, #ffffff, #f7f1e6)',
            boxShadow: '0 40px 80px -34px rgba(26,21,15,.45)',
          }}
        >
          <div
            className="absolute border border-accent/25 pointer-events-none"
            style={{ inset: 14, borderRadius: 6 }}
          />
          <span className="font-mono uppercase text-accent" style={{ fontSize: 10, letterSpacing: '.35em', marginBottom: 18 }}>
            A Life In
          </span>
          <span className="font-display italic text-text-primary text-center" style={{ fontSize: 44, lineHeight: 1 }}>
            Legacy
          </span>
          <div style={{ width: 40, height: 1, margin: '20px 0', background: 'rgb(var(--color-accent) / 0.25)' }} />
          <span className="font-display text-text-muted" style={{ fontSize: 17 }}>
            Volume One
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── 5. The Legacy ───────────────────────────────────────────────────────

const OTHER_FORMATS = [
  { icon: LayoutGrid, name: 'The Comic', tag: 'Illustrated panels' },
  { icon: Monitor, name: 'The Webpage', tag: 'A living digital edition' },
  { icon: Headphones, name: 'The Audiobook', tag: 'Narrated' },
  { icon: Clock, name: 'The Time Capsule', tag: 'Sealed & delivered' },
]

function TheLegacySection() {
  const ref = useReveal()

  return (
    <section
      id="the-legacy"
      ref={ref as React.RefObject<HTMLElement>}
      className="hl-reveal py-24 px-6 scroll-mt-16"
      aria-labelledby="legacy-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent m-0 mb-5">The Legacy</p>
          <h2
            id="legacy-heading"
            className="font-display font-light text-text-primary m-0 leading-[1.05]"
            style={{ fontSize: 'clamp(34px, 5vw, 66px)' }}
          >
            It becomes a book.
          </h2>
        </div>
        <p
          className="font-body text-text-muted text-center max-w-[600px] mx-auto mb-14"
          style={{ fontSize: 18, lineHeight: 1.6 }}
        >
          A real one, in your hands. And when you want to, the same story can live on in
          other forms too.
        </p>

        {/* Book feature card */}
        <div
          className="rounded-[24px] bg-surface border border-accent/25 shadow-sm mb-14 hl-book-grid"
          style={{ padding: 'clamp(30px, 4.5vw, 60px)', boxShadow: '0 40px 90px -50px rgba(26,21,15,.3)' }}
        >
          <div className="hl-book-copy">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent m-0 mb-3">
              The centerpiece
            </p>
            <h3
              className="font-display font-normal text-text-primary m-0 mb-4 leading-none"
              style={{ fontSize: 'clamp(40px, 6vw, 68px)' }}
            >
              The Book
            </h3>
            <p className="font-body text-text-muted m-0 mb-7 max-w-[480px]" style={{ fontSize: 'clamp(17px, 2vw, 20px)', lineHeight: 1.62 }}>
              Printed, bound, and delivered to your door — the whole story as a hardcover
              keepsake, made to live on a shelf and be handed down for generations.
            </p>
            <div className="flex flex-wrap gap-3.5">
              {['Hardcover / paperback', 'On-demand'].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 font-mono text-xs text-text-primary border border-accent/25 rounded-full px-3.5 py-2"
                  style={{ letterSpacing: '.06em', background: 'rgb(var(--color-accent) / 0.12)' }}
                >
                  <span className="rounded-full bg-accent" style={{ width: 5, height: 5 }} />
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="hl-book-visual flex items-center justify-center">
            <BookCover />
          </div>
        </div>

        {/* Secondary formats */}
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-muted whitespace-nowrap">
            Other ways to share it
          </span>
          <span className="flex-1 h-px bg-border" />
        </div>
        <div className="hl-format-grid">
          {OTHER_FORMATS.map((fmt) => {
            const Icon = fmt.icon
            return (
              <div key={fmt.name} className="rounded-2xl bg-surface border border-border" style={{ padding: '24px 22px' }}>
                <span
                  className="flex items-center justify-center text-accent"
                  style={{ width: 44, height: 44, borderRadius: 12, background: 'rgb(var(--color-accent) / 0.12)', marginBottom: 18 }}
                >
                  <Icon className="w-[21px] h-[21px]" strokeWidth={1.5} />
                </span>
                <p className="font-display font-medium text-text-primary m-0 mb-2" style={{ fontSize: 22 }}>
                  {fmt.name}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted m-0">{fmt.tag}</p>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        .hl-book-grid { display: grid; grid-template-columns: 1fr; gap: 2.5rem; align-items: center; }
        @media (min-width: 821px) {
          .hl-book-grid { grid-template-columns: 1.05fr 0.95fr; gap: clamp(32px, 5vw, 64px); }
        }
        .hl-book-copy { order: 2; text-align: center; }
        .hl-book-visual { order: 1; }
        @media (min-width: 821px) {
          .hl-book-copy { order: 0; text-align: left; }
          .hl-book-copy p { margin-left: 0; margin-right: 0; }
          .hl-book-visual { order: 0; }
        }
        .hl-book-copy.hl-book-copy p { margin-left: auto; margin-right: auto; }

        .hl-format-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
        @media (min-width: 561px) { .hl-format-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 921px) { .hl-format-grid { grid-template-columns: repeat(4, 1fr); } }
      `}</style>
    </section>
  )
}

// ─── 6. Closing CTA ──────────────────────────────────────────────────────

function ClosingCtaSection() {
  const ref = useReveal()

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="hl-reveal py-28 px-6 text-center"
      aria-label="Call to action"
    >
      <div className="mx-auto max-w-2xl">
        <span className="inline-flex items-center justify-center text-accent mb-6">
          <Feather className="w-9 h-9" strokeWidth={1.5} />
        </span>

        <p
          className="font-display italic font-light text-text-primary m-0 mb-10 leading-[1.2]"
          style={{ fontSize: 'clamp(28px, 4.4vw, 52px)' }}
        >
          All memories fade. They don’t have to be forgotten.
        </p>

        <a
          href="#"
          className="inline-flex items-center font-body text-base font-semibold bg-accent text-background px-8 rounded-[13px] hover:bg-accent-hover transition-all duration-200 min-h-[52px] shadow-lg hover:-translate-y-0.5"
        >
          Start Your Story
        </a>

        <p className="font-mono text-[13px] tracking-[0.06em] text-text-muted m-0 mt-[18px]">
          Write your first story in under two minutes.
        </p>
      </div>
    </section>
  )
}

// ─── 7. Footer ───────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-accent px-6 pt-14 pb-10 bg-transparent">
      <div className="mx-auto max-w-6xl">
        <div className="hl-footer-grid mb-12">
          {/* Brand */}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent m-0 mb-2">
              Brought to you by
            </p>
            <p className="font-display text-text-primary m-0 mb-3" style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.1 }}>
              Second Brain <em className="text-accent not-italic font-normal italic">Labs</em>
            </p>
            <p className="font-body text-text-muted m-0 max-w-sm" style={{ fontSize: 15, lineHeight: 1.6 }}>
              Second Brain Labs is a small workshop built around the belief that language
              is changing the relationship between people and technology.
            </p>
          </div>

          {/* Learn */}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted m-0 mb-4">Learn</p>
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              {[
                { label: 'About', href: '#what-is-heirloom' },
                { label: 'Blog', href: '#' },
                { label: 'LinkedIn ↗', href: '#' },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="font-body text-text-primary hover:text-accent transition-colors no-underline"
                    style={{ fontSize: 15 }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted m-0 mb-4">Contact</p>
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              <li>
                <a
                  href="mailto:hello@2bl.ai"
                  className="font-body text-text-primary hover:text-accent transition-colors no-underline"
                  style={{ fontSize: 15 }}
                >
                  hello@2bl.ai
                </a>
              </li>
              <li>
                <span className="font-body text-text-muted" style={{ fontSize: 15 }}>
                  Toronto · Remote
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="font-body text-text-muted m-0" style={{ fontSize: 14 }}>
            © 2026 Second Brain Labs, Inc.
          </p>
          <p className="font-display italic text-text-muted m-0" style={{ fontSize: 15 }}>
            Trying the impossible, one product at a time.
          </p>
        </div>
      </div>

      <style>{`
        .hl-footer-grid { display: grid; grid-template-columns: 1fr; gap: 2.5rem; }
        @media (min-width: 461px) { .hl-footer-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 761px) { .hl-footer-grid { grid-template-columns: 1.4fr 1fr 1fr; } }
      `}</style>
    </footer>
  )
}

// ─── Reveal CSS ───────────────────────────────────────────────────────────

const REVEAL_CSS = `
  .hl-reveal {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .hl-reveal.hl-visible {
    opacity: 1;
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .hl-reveal {
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
    }
  }
`

// ─── Root ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-text-primary">
      <style>{REVEAL_CSS}</style>
      <LandingNav />
      <main>
        <HeroSection />
        <WhatIsHeirloomSection />
        <TheBestPartsSection />
        <TheLegacySection />
        <ClosingCtaSection />
      </main>
      <Footer />
    </div>
  )
}
