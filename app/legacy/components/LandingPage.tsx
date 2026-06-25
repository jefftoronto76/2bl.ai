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
  Menu,
  X,
} from 'lucide-react'

// ─── Scroll reveal hook ────────────────────────────────────────────────────

function useReveal() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      el.classList.add('lg-visible')
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('lg-visible')
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
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
      : 'bg-transparent'

  const navLinks = [
    { label: 'The Best Part', target: 'the-best-part' },
    { label: 'Pricing', target: 'pricing' },
    { label: 'About', target: 'what-is-legacy' },
  ]

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-200 ${navBg}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-16">
        {/* Wordmark */}
        <a
          href="/legacy"
          className="flex items-center gap-2 text-lg-text-primary no-underline"
          aria-label="Legacy home"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/10">
            <Feather className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
          </span>
          <span className="font-display font-light text-[1.1rem] tracking-tight">Legacy</span>
        </a>

        {/* Desktop center links */}
        <ul className="hidden md:flex items-center gap-7 list-none m-0 p-0">
          {navLinks.map((link) => (
            <li key={link.target}>
              <button
                onClick={() => scrollTo(link.target)}
                className="font-body text-sm text-lg-text-muted hover:text-lg-text-primary transition-colors bg-transparent border-0 cursor-pointer p-0"
              >
                {link.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Desktop right CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="#"
            className="font-body text-sm text-lg-text-muted hover:text-lg-text-primary transition-colors px-3 py-2 rounded-lg border border-lg-border hover:border-lg-text-primary/30"
          >
            Sign Up
          </a>
          <a
            href="#"
            className="font-body text-sm bg-accent text-white px-4 py-2 rounded-lg hover:bg-lg-accent-hover transition-colors min-h-[44px] flex items-center"
          >
            Start Your Story
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg text-lg-text-primary hover:bg-lg-text-primary/5 transition-colors"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          menuOpen ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'
        } bg-surface/98 border-b border-lg-border`}
      >
        <ul className="list-none m-0 p-0 px-6 py-4 flex flex-col gap-1">
          {navLinks.map((link) => (
            <li key={link.target}>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setTimeout(() => scrollTo(link.target), 10)
                }}
                className="w-full text-left font-body text-base text-lg-text-primary py-3 min-h-[44px] bg-transparent border-0 cursor-pointer"
              >
                {link.label}
              </button>
            </li>
          ))}
          <li className="pt-2 border-t border-lg-border mt-2">
            <a
              href="#"
              className="block font-body text-base text-lg-text-muted py-3 min-h-[44px] flex items-center"
              onClick={() => setMenuOpen(false)}
            >
              Sign Up
            </a>
          </li>
        </ul>
      </div>
    </nav>
  )
}

// ─── Format Fan card (hero visual) ───────────────────────────────────────

const FORMAT_ITEMS = [
  { icon: BookOpen, name: 'The Book', tag: 'Hardcover' },
  { icon: Monitor, name: 'The Webpage', tag: 'Digital' },
  { icon: Headphones, name: 'The Audiobook', tag: 'Narrated' },
  { icon: Feather, name: 'The Comic', tag: 'Illustrated' },
  { icon: Clock, name: 'Time Capsule', tag: 'Sealed' },
]

function FormatFan() {
  const rotations = [-6, -3, 0, 3, 6]
  const yOffsets = [12, 6, 0, 6, 12]

  return (
    <div className="relative w-72 h-80 select-none" aria-hidden>
      {FORMAT_ITEMS.map((item, i) => {
        const Icon = item.icon
        return (
          <div
            key={item.name}
            className="absolute inset-x-4 top-4 bg-surface rounded-xl border border-lg-border shadow-sm px-5 py-4 flex items-center gap-3"
            style={{
              transform: `rotate(${rotations[i]}deg) translateY(${yOffsets[i]}px)`,
              zIndex: FORMAT_ITEMS.length - i,
            }}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/10 shrink-0">
              <Icon className="w-4 h-4 text-accent" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <p className="font-body font-medium text-sm text-lg-text-primary m-0 leading-tight">
                {item.name}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted m-0 mt-0.5">
                {item.tag}
              </p>
            </div>
            <span className="ml-auto font-mono text-xs text-lg-text-muted/50">
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
      <div className="mx-auto max-w-6xl flex items-center gap-16">
        {/* Left copy */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent m-0 mb-5">
            Private.&nbsp; Secure.&nbsp; Collaborative.
          </p>

          <h1
            className="font-display font-light text-lg-text-primary m-0 leading-[1.05]"
            style={{ fontSize: 'clamp(56px, 8vw, 108px)' }}
          >
            Legacy
          </h1>

          <p className="font-display italic text-accent m-0 mt-4 text-xl leading-snug">
            Capture life as it happens.
          </p>

          <p className="font-body text-lg-text-muted m-0 mt-6 max-w-md leading-relaxed">
            The moments pass quickly. The stories behind them fade even faster.
          </p>
          <p className="font-body text-lg-text-muted m-0 mt-2 max-w-md leading-relaxed">
            Capture memories while they&rsquo;re fresh, and turn them into something
            you&rsquo;ll always have.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-10">
            <a
              href="#"
              className="font-body text-sm bg-accent text-white px-6 py-3 rounded-lg hover:bg-lg-accent-hover transition-colors min-h-[44px] flex items-center"
            >
              Start Your Story
            </a>
            <button
              onClick={() => scrollTo('learn-more')}
              className="font-body text-sm text-lg-text-muted hover:text-lg-text-primary px-4 py-3 rounded-lg border border-lg-border hover:border-lg-text-primary/30 transition-colors min-h-[44px] bg-transparent cursor-pointer"
            >
              Learn More
            </button>
          </div>
        </div>

        {/* Right fan — hidden ≤920px */}
        <div className="hidden shrink-0" style={{ display: 'none' }} aria-hidden>
          {/* placeholder to keep TSC happy — actual visibility is CSS below */}
        </div>
        <div className="shrink-0 lg-fan-visible">
          <FormatFan />
        </div>
      </div>

      <style>{`
        .lg-fan-visible { display: none; }
        @media (min-width: 921px) { .lg-fan-visible { display: block; } }
      `}</style>
    </section>
  )
}

// ─── 3. What Is Legacy ───────────────────────────────────────────────────

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
    body: "Legacy's storytelling engine helps you uncover what matters most and tell it well.",
  },
  {
    index: '03',
    icon: BookOpen,
    label: 'Publish',
    body: 'Give those stories a form that can be shared, revisited, and passed along.',
  },
]

function WhatIsLegacySection() {
  const ref = useReveal()

  return (
    <section
      id="what-is-legacy"
      ref={ref as React.RefObject<HTMLElement>}
      className="lg-reveal py-24 px-6 scroll-mt-16"
      aria-labelledby="what-heading"
    >
      <div id="learn-more" className="mx-auto max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent m-0 mb-4">
          What Is Legacy
        </p>
        <h2
          id="what-heading"
          className="font-display font-light text-lg-text-primary text-3xl md:text-4xl m-0 mb-16 max-w-2xl leading-snug"
        >
          Through simple conversations, Legacy helps you give your memories a future.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {HOW_CARDS.map((card, i) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className="border-t border-lg-border pt-6"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="relative">
                  <span
                    className="absolute top-0 right-0 font-mono text-7xl font-light leading-none text-lg-text-primary/5 select-none pointer-events-none"
                    aria-hidden
                  >
                    {card.index}
                  </span>
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/10 mb-4">
                    <Icon className="w-4 h-4 text-accent" strokeWidth={1.5} />
                  </span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent m-0 mb-3">
                  {card.label}
                </p>
                <p className="font-body text-base text-lg-text-muted leading-relaxed m-0">
                  {card.body}
                </p>
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
  { icon: MessageCircle, title: 'Questions that draw it out', body: 'Thoughtful prompts that help surface the stories you didn\'t know you had.' },
  { icon: Users, title: 'Many voices, one story', body: 'Invite family and friends to contribute their own perspective.' },
  { icon: Image, title: 'Memories keep their media', body: 'Photos, voice notes, and documents woven right into the narrative.' },
  { icon: Clock, title: 'It remembers, even if you don\'t', body: 'Every detail is saved and searchable, so nothing gets lost over time.' },
]

function TheBestPartsSection() {
  const ref = useReveal()
  const [voted, setVoted] = useState(false)
  const [count, setCount] = useState(47)

  useEffect(() => {
    if (localStorage.getItem('hl.liveEditorVote') === '1') {
      setVoted(true)
      setCount(48)
    }
  }, [])

  const handleVote = useCallback(() => {
    if (voted) return
    setVoted(true)
    setCount((c) => c + 1)
    localStorage.setItem('hl.liveEditorVote', '1')
  }, [voted])

  return (
    <section
      id="the-best-part"
      ref={ref as React.RefObject<HTMLElement>}
      className="lg-reveal py-24 px-6 scroll-mt-16"
      aria-labelledby="best-heading"
    >
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent m-0 mb-4">
          Changing the way memories are saved and shared.
        </p>
        <h2
          id="best-heading"
          className="font-display font-light text-lg-text-primary text-3xl md:text-4xl m-0 mb-12 leading-snug"
        >
          The Best Parts
        </h2>

        {/* Lead card */}
        <div className="bg-surface rounded-2xl border border-lg-border p-8 md:p-10 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/10">
              <Feather className="w-4 h-4 text-accent" strokeWidth={1.5} />
            </span>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent m-0">
              Storytelling, built in
            </p>
          </div>
          <h3 className="font-display font-light text-lg-text-primary text-2xl md:text-3xl m-0 mb-4 leading-snug">
            You don&rsquo;t have to be a writer.
          </h3>
          <p className="font-body text-lg-text-muted leading-relaxed m-0 max-w-xl">
            Legacy&rsquo;s conversational interface does the heavy lifting. You share,
            it listens, asks the right follow-ups, and shapes your words into something
            worth keeping.
          </p>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.title}
                className="bg-surface rounded-xl border border-lg-border p-6"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/10 mb-4">
                  <Icon className="w-4 h-4 text-accent" strokeWidth={1.5} />
                </span>
                <h3 className="font-body font-medium text-lg-text-primary text-base m-0 mb-2">
                  {card.title}
                </h3>
                <p className="font-body text-sm text-lg-text-muted leading-relaxed m-0">
                  {card.body}
                </p>
              </div>
            )
          })}
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Secure & responsible */}
          <a
            href="#"
            className="bg-surface rounded-xl border border-lg-border p-6 block no-underline group hover:border-accent/40 transition-colors"
            aria-label="Learn more about our security and responsible AI practices"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/10 mb-4">
              <Shield className="w-4 h-4 text-accent" strokeWidth={1.5} />
            </span>
            <h3 className="font-body font-medium text-lg-text-primary text-base m-0 mb-2">
              Secure &amp; responsible
            </h3>
            <p className="font-body text-sm text-lg-text-muted leading-relaxed m-0">
              Your stories are private, encrypted, and never used to train AI models.
              We&rsquo;re committed to keeping it that way.{' '}
              <span className="text-accent">Learn more →</span>
            </p>
          </a>

          {/* Live editor teaser */}
          <div className="bg-surface rounded-xl border-2 border-dashed border-accent/50 p-6 relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/10">
                <Feather className="w-4 h-4 text-accent" strokeWidth={1.5} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                Coming soon
              </span>
            </div>
            <h3 className="font-body font-medium text-lg-text-primary text-base m-0 mb-2">
              A live editor
            </h3>
            <p className="font-body text-sm text-lg-text-muted leading-relaxed m-0 mb-5">
              Edit your story the way you&rsquo;d edit a document — with your changes
              synced instantly across contributors.
            </p>
            <button
              onClick={handleVote}
              disabled={voted}
              aria-label={voted ? 'You voted for this feature' : 'Vote for this feature'}
              className={`flex items-center gap-2 font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-lg border transition-colors min-h-[44px] ${
                voted
                  ? 'bg-accent/10 border-accent/30 text-accent cursor-default'
                  : 'border-lg-border text-lg-text-muted hover:border-accent/40 hover:text-accent bg-transparent cursor-pointer'
              }`}
            >
              <Heart
                className="w-3.5 h-3.5"
                fill={voted ? 'currentColor' : 'none'}
                strokeWidth={1.5}
              />
              <span>{count}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── CSS Book Cover ───────────────────────────────────────────────────────

function BookCover() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden>
      {/* Page-stack edge */}
      <div
        className="absolute rounded-r-sm"
        style={{
          left: '100%',
          top: 6,
          bottom: 6,
          width: 14,
          background: 'linear-gradient(to right, #e8dcc8, #f2ead8)',
          boxShadow: '2px 0 6px rgba(0,0,0,0.08)',
        }}
      />
      {/* Spine */}
      <div
        className="absolute left-0 inset-y-0 w-5 bg-accent rounded-l-sm"
        style={{ boxShadow: 'inset -2px 0 6px rgba(0,0,0,0.15)' }}
      />
      {/* Cover face */}
      <div
        className="relative bg-surface rounded-r-sm overflow-hidden"
        style={{
          width: 180,
          height: 240,
          boxShadow: '4px 6px 24px rgba(0,0,0,0.12)',
          borderTop: '1px solid #e6dcc8',
          borderRight: '1px solid #e6dcc8',
          borderBottom: '1px solid #e6dcc8',
        }}
      >
        {/* Cover design */}
        <div className="absolute inset-0 flex flex-col justify-between p-5">
          <div>
            <div
              className="w-full rounded-sm mb-4"
              style={{ height: 80, background: 'rgb(var(--lg-bg))' }}
            />
            <p className="font-display italic text-lg-text-primary text-lg m-0 leading-tight">
              My Story
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-lg-text-muted m-0 mt-1">
              A Legacy Book
            </p>
          </div>
          <div
            className="h-px w-full"
            style={{ background: 'rgb(var(--color-accent) / 0.25)' }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── 5. The Legacy ───────────────────────────────────────────────────────

const OTHER_FORMATS = [
  { icon: Feather, name: 'The Comic', tag: 'Illustrated panels' },
  { icon: Monitor, name: 'The Webpage', tag: 'Always online' },
  { icon: Headphones, name: 'The Audiobook', tag: 'Narrated' },
  { icon: Clock, name: 'Time Capsule', tag: 'Sealed & delivered' },
]

function TheLegacySection() {
  const ref = useReveal()

  return (
    <section
      id="the-legacy"
      ref={ref as React.RefObject<HTMLElement>}
      className="lg-reveal py-24 px-6 scroll-mt-16"
      aria-labelledby="legacy-heading"
    >
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent m-0 mb-4">
          The Legacy
        </p>
        <h2
          id="legacy-heading"
          className="font-display font-light text-lg-text-primary text-3xl md:text-4xl m-0 mb-3 leading-snug"
        >
          It becomes a book.
        </h2>
        <p className="font-body text-lg-text-muted m-0 mb-12 max-w-xl leading-relaxed">
          A real one, in your hands. And when you want to, the same story can live
          on in other forms too.
        </p>

        {/* Book feature card */}
        <div className="bg-surface rounded-2xl border border-accent/25 shadow-sm p-8 md:p-12 mb-10 lg-book-grid">
          <div className="lg-book-copy">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent m-0 mb-3">
              The centerpiece
            </p>
            <h3 className="font-display font-light text-lg-text-primary text-2xl md:text-3xl m-0 mb-4 leading-snug">
              The Book
            </h3>
            <p className="font-body text-lg-text-muted leading-relaxed m-0 mb-6 max-w-sm">
              A beautifully typeset memoir, ready to print and hold. Give one to
              everyone who matters. It&rsquo;s the kind of gift that outlasts everything else.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted border border-lg-border px-3 py-1.5 rounded-full">
                Hardcover / paperback
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted border border-lg-border px-3 py-1.5 rounded-full">
                On-demand
              </span>
            </div>
          </div>
          <div className="lg-book-visual flex items-center justify-center pt-8 md:pt-0">
            <BookCover />
          </div>
        </div>

        {/* Secondary formats */}
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lg-text-muted m-0 mb-6">
          Other ways to share it
        </p>
        <div className="lg-format-grid">
          {OTHER_FORMATS.map((fmt) => {
            const Icon = fmt.icon
            return (
              <div
                key={fmt.name}
                className="bg-surface rounded-xl border border-lg-border p-5"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/10 mb-3">
                  <Icon className="w-4 h-4 text-accent" strokeWidth={1.5} />
                </span>
                <p className="font-body font-medium text-sm text-lg-text-primary m-0 mb-1">
                  {fmt.name}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted m-0">
                  {fmt.tag}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        .lg-book-grid {
          display: grid;
          grid-template-columns: 1fr;
        }
        @media (min-width: 821px) {
          .lg-book-grid {
            grid-template-columns: 1fr auto;
            gap: 4rem;
            align-items: center;
          }
        }
        .lg-book-visual { order: -1; }
        @media (min-width: 821px) { .lg-book-visual { order: 0; } }

        .lg-format-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        @media (min-width: 561px) {
          .lg-format-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 921px) {
          .lg-format-grid { grid-template-columns: repeat(4, 1fr); }
        }
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
      className="lg-reveal py-28 px-6 text-center"
      aria-label="Call to action"
    >
      <div className="mx-auto max-w-2xl">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent/10 mb-8">
          <Feather className="w-5 h-5 text-accent" strokeWidth={1.5} />
        </span>

        <p className="font-display italic font-light text-lg-text-primary text-2xl md:text-3xl lg:text-4xl m-0 mb-10 leading-snug">
          All memories fade.&nbsp;They don&rsquo;t have to be forgotten.
        </p>

        <a
          href="#"
          className="inline-flex items-center font-body text-sm bg-accent text-white px-8 py-3.5 rounded-lg hover:bg-lg-accent-hover transition-colors min-h-[44px]"
        >
          Start Your Story
        </a>

        <p className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted m-0 mt-5">
          Write your first story in under two minutes.
        </p>
      </div>
    </section>
  )
}

// ─── 7. Footer ───────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-accent px-6 pt-12 pb-8 bg-transparent">
      <div className="mx-auto max-w-6xl">
        <div className="lg-footer-grid mb-10">
          {/* Brand */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted m-0 mb-3">
              Brought to you by
            </p>
            <p className="font-display font-light text-lg-text-primary text-lg m-0 mb-3">
              Second Brain{' '}
              <em className="text-accent not-italic font-normal">Labs</em>
            </p>
            <p className="font-body text-sm text-lg-text-muted leading-relaxed m-0 max-w-xs">
              A workshop for ideas at the edge of what&rsquo;s possible with AI.
            </p>
          </div>

          {/* Learn */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted m-0 mb-4">
              Learn
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
              {[
                { label: 'About', href: '#what-is-legacy' },
                { label: 'Blog', href: '#' },
                { label: 'LinkedIn ↗', href: '#' },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="font-body text-sm text-lg-text-muted hover:text-lg-text-primary transition-colors no-underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-lg-text-muted m-0 mb-4">
              Contact
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
              <li>
                <a
                  href="mailto:hello@2bl.ai"
                  className="font-body text-sm text-lg-text-muted hover:text-lg-text-primary transition-colors no-underline"
                >
                  hello@2bl.ai
                </a>
              </li>
              <li>
                <p className="font-body text-sm text-lg-text-muted m-0">
                  Toronto&nbsp;·&nbsp;Remote
                </p>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-lg-border pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="font-body text-xs text-lg-text-muted m-0">
            &copy; 2026 Second Brain Labs, Inc.
          </p>
          <p className="font-display italic font-light text-xs text-lg-text-muted m-0">
            Trying the impossible, one product at a time.
          </p>
        </div>
      </div>

      <style>{`
        .lg-footer-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
        }
        @media (min-width: 461px) {
          .lg-footer-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 761px) {
          .lg-footer-grid { grid-template-columns: 2fr 1fr 1fr; }
        }
      `}</style>
    </footer>
  )
}

// ─── Reveal CSS ───────────────────────────────────────────────────────────

const REVEAL_CSS = `
  .lg-reveal {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.55s ease, transform 0.55s ease;
  }
  .lg-reveal.lg-visible {
    opacity: 1;
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .lg-reveal {
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
    }
  }
`

// ─── Root ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-lg-background text-lg-text-primary">
      <style>{REVEAL_CSS}</style>
      <LandingNav />
      <main>
        <HeroSection />
        <WhatIsLegacySection />
        <TheBestPartsSection />
        <TheLegacySection />
        <ClosingCtaSection />
      </main>
      <Footer />
    </div>
  )
}
